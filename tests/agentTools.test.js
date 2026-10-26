import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { book, bookedSeats, createShowtime, createUser, useTestDatabase } from "./helpers.js";
import { runTool } from "../services/agentTools.js";
import AgentProposal from "../models/AgentProposal.js";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";

useTestDatabase();

const setup = async () => {
  const admin = await createUser("ADMIN");
  const alice = await createUser();
  const bob = await createUser();
  const { showtime, movie, cinema } = await createShowtime(admin, { price: 11 });
  return { admin, alice, bob, showtime, movie, cinema };
};

const refusal = (status, message) => (err) => {
  assert.equal(err.statusCode, status);
  if (message) assert.match(err.message, message);
  return true;
};

describe("assistant tools", () => {
  it("refuse unknown tools and invalid arguments before anything runs", async () => {
    const { alice } = await setup();
    await assert.rejects(runTool(alice.user, "holdSeats", {}), refusal(400, /Unknown tool/));
    await assert.rejects(runTool(alice.user, "constructor", {}), refusal(400, /Unknown tool/));
    await assert.rejects(runTool(alice.user, "getBookingQuote", { seats: ["A1"] }), refusal(400, /showtime is required/));
    await assert.rejects(runTool(alice.user, "searchShowtimes", { genre: "Opera" }), refusal(400, /genre/));
    await assert.rejects(runTool(alice.user, "searchShowtimes", { date: "tomorrow" }), refusal(400, /date/));
  });

  it("search movies and upcoming showtimes, with the cinema and local time", async () => {
    const { alice, showtime, movie } = await setup();

    const movies = await runTool(alice.user, "searchMovies", { title: "mov" });
    assert.deepEqual(movies.map((m) => m.movie), [String(movie._id)]);

    const found = await runTool(alice.user, "searchShowtimes", { genre: "Drama", area: "town" });
    assert.equal(found.length, 1);
    assert.equal(found[0].showtime, String(showtime._id));
    assert.equal(found[0].movie, "Movie");
    assert.equal(found[0].cinema, "Cinema");
    assert.equal(found[0].pricePerSeat, 11);
    assert.equal(found[0].seatsAvailable, 120);
    assert.match(found[0].localTime, /\d{2}:\d{2}/);

    assert.deepEqual(await runTool(alice.user, "searchShowtimes", { genre: "Comedy" }), []);
  });

  it("show taken seats and quote prices without reserving anything", async () => {
    const { alice, bob, showtime } = await setup();
    await book(bob, showtime, ["A1"]);

    const seats = await runTool(alice.user, "getAvailableSeats", { showtime: String(showtime._id) });
    assert.deepEqual(seats.taken, ["A1"]);
    assert.equal(seats.available, 119);

    const quote = await runTool(alice.user, "getBookingQuote", { showtime: String(showtime._id), seats: ["B1", "B2"] });
    assert.equal(quote.totalCents, 2200);
    assert.deepEqual(await bookedSeats(showtime), ["A1"]);

    await assert.rejects(
      runTool(alice.user, "getBookingQuote", { showtime: String(showtime._id), seats: ["A1"] }),
      refusal(409, /already booked/)
    );
  });

  it("only ever show the logged-in user's own bookings and payments, even for admins", async () => {
    const { admin, alice, bob, showtime } = await setup();
    const booking = await book(alice, showtime, ["C1"]);
    await Payment.create({
      booking: booking._id,
      user: alice.user._id,
      paypalOrderId: "ORDERTOOLS1AAAA",
      amountCents: 1100,
      currency: "USD",
    });

    const mine = await runTool(alice.user, "getMyBookings", {});
    assert.deepEqual(mine.map((b) => b.booking), [String(booking._id)]);
    assert.equal(mine[0].movie, "Movie");
    assert.deepEqual(await runTool(bob.user, "getMyBookings", {}), []);
    assert.deepEqual(await runTool(admin.user, "getMyBookings", {}), []);

    assert.equal((await runTool(alice.user, "getPaymentStatus", { booking: String(booking._id) })).payment.status, "created");
    assert.equal((await runTool(bob.user, "getPaymentStatus", { booking: String(booking._id) })).payment, null);

    await assert.rejects(
      runTool(admin.user, "getCancellationQuote", { booking: String(booking._id) }),
      refusal(404, /Booking not found/)
    );
  });

  it("propose a booking as a card for the logged-in user, reserving nothing", async () => {
    const { alice, bob, showtime } = await setup();

    // A user ID from the model is dropped, never used
    const { proposal, card } = await runTool(alice.user, "proposeBooking", {
      showtime: String(showtime._id),
      seats: ["D1", "D2"],
      user: String(bob.user._id),
      totalCents: 1,
    });
    assert.equal(card.type, "booking");
    assert.equal(card.totalCents, 2200);
    assert.deepEqual(card.seats, ["D1", "D2"]);
    assert.equal(card.movie, "Movie");

    const saved = await AgentProposal.findById(proposal);
    assert.equal(String(saved.user), String(alice.user._id));
    assert.equal(saved.status, "open");
    assert.equal(saved.totalCents, 2200);
    assert.ok(saved.expiresAt > new Date());

    assert.equal(await Booking.countDocuments(), 0);
    assert.deepEqual(await bookedSeats(showtime), []);
  });

  it("refuse to propose seats that are taken, or a cancellation of someone else's booking", async () => {
    const { alice, bob, showtime } = await setup();
    const booking = await book(bob, showtime, ["E1"]);

    await assert.rejects(
      runTool(alice.user, "proposeBooking", { showtime: String(showtime._id), seats: ["E1"] }),
      refusal(409, /already booked/)
    );
    await assert.rejects(
      runTool(alice.user, "proposeCancellation", { booking: String(booking._id) }),
      refusal(404, /Booking not found/)
    );
    assert.equal(await AgentProposal.countDocuments(), 0);
  });
});
