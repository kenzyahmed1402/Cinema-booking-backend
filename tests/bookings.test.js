import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Booking from "../models/Booking.js";
import Screen from "../models/screens.js";
import { api, book, bookedSeats, created, createShowtime, createUser, useTestDatabase } from "./helpers.js";

useTestDatabase();

describe("creating a booking", () => {
  it("ties it to the logged-in account and calculates the price", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser("CUSTOMER", "Alice");
    const { showtime } = await createShowtime(admin, { price: 12.5 });

    // Name, email, price and status from the client are all ignored
    const res = await api.post("/bookings").set(alice.auth).send({
      showtime: showtime._id,
      seats: ["A1", "A2"],
      customerName: "Fake Name",
      customerEmail: "fake@example.com",
      totalPrice: 0,
      status: "confirmed",
    });

    assert.equal(res.status, 201);
    const booking = res.body.data.booking;
    assert.equal(booking.user, String(alice.user._id));
    assert.equal(booking.customerName, "Alice");
    assert.equal(booking.customerEmail, alice.user.email);
    assert.equal(booking.totalPrice, 25);
    assert.equal(booking.status, "pending");
    assert.deepEqual(await bookedSeats(showtime), ["A1", "A2"]);
  });

  it("rounds the price to cents", async () => {
    const admin = await createUser("ADMIN");
    const { showtime } = await createShowtime(admin, { price: 0.1 });
    const booking = await book(admin, showtime, ["A1", "A2", "A3"]);
    assert.equal(booking.totalPrice, 0.3);
  });

  for (const [label, seats] of [
    ["a lowercase seat code", ["a1"]],
    ["a leading zero", ["A01"]],
    ["a row the screen doesn't have", ["K1"]],
    ["a seat number past the end of the row", ["A13"]],
    ["the same seat twice", ["A1", "A1"]],
  ]) {
    it(`rejects ${label} without reserving anything`, async () => {
      const admin = await createUser("ADMIN");
      const { showtime } = await createShowtime(admin, { rows: 10, seatsPerRow: 12 });
      const res = await api.post("/bookings").set(admin.auth).send({ showtime: showtime._id, seats });
      assert.equal(res.status, 400);
      assert.deepEqual(await bookedSeats(showtime), []);
    });
  }

  it("blocks a seat that is already booked", async () => {
    const admin = await createUser("ADMIN");
    const { showtime } = await createShowtime(admin);
    await book(admin, showtime, ["B2"]);
    const res = await api.post("/bookings").set(admin.auth).send({ showtime: showtime._id, seats: ["B2"] });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /B2/);
  });

  it("releases the reserved seats if saving the booking fails", async (t) => {
    const admin = await createUser("ADMIN");
    const { showtime } = await createShowtime(admin);
    t.mock.method(Booking, "create", async () => {
      throw new Error("database write failed");
    });

    const res = await api.post("/bookings").set(admin.auth).send({ showtime: showtime._id, seats: ["C3"] });
    assert.equal(res.status, 500);
    assert.deepEqual(await bookedSeats(showtime), []);
  });

  it("uses a seat count on older screens that have no layout", async () => {
    const admin = await createUser("ADMIN");
    const { cinema, movie } = await createShowtime(admin);
    const oldScreen = await Screen.create({ cinema: cinema._id, screenNumber: 9, capacity: 2 });
    const showtime = created(
      await api.post("/showTimes").set(admin.auth).send({
        movie: movie._id,
        screen: oldScreen._id,
        startTime: "2030-01-01T19:00:00.000Z",
        price: 10,
      })
    );

    await book(admin, showtime, ["A1", "A2"]);
    const res = await api.post("/bookings").set(admin.auth).send({ showtime: showtime._id, seats: ["A3"] });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /Not enough seats: 0 of 2 left/);
  });
});

describe("seat limits", () => {
  it("allow at most 10 seats in one booking", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser("CUSTOMER", "Alice");
    const { showtime } = await createShowtime(admin);
    const eleven = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11"];
    const res = await api.post("/bookings").set(alice.auth).send({ showtime: showtime._id, seats: eleven });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /seats must have at most 10 items/);
  });

  it("allow a customer at most 10 active seats per showtime, across bookings", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser("CUSTOMER", "Alice");
    const { showtime } = await createShowtime(admin);
    await book(alice, showtime, ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"]);

    const tooMany = await api.post("/bookings").set(alice.auth).send({ showtime: showtime._id, seats: ["B1", "B2", "B3"] });
    assert.equal(tooMany.status, 409);
    assert.match(tooMany.body.message, /at most 10 seats per showtime \(you already have 8\)/);

    const twoMore = await book(alice, showtime, ["B1", "B2"]);
    assert.equal((await api.post("/bookings").set(alice.auth).send({ showtime: showtime._id, seats: ["C1"] })).status, 409);

    // Cancelled seats don't count
    await api.put(`/bookings/${twoMore._id}`).set(alice.auth).send({ status: "cancelled" });
    assert.equal((await api.post("/bookings").set(alice.auth).send({ showtime: showtime._id, seats: ["C1", "C2"] })).status, 201);
  });

  it("count per showtime, and don't apply to admins", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser("CUSTOMER", "Alice");
    const { showtime } = await createShowtime(admin);
    const { showtime: other } = await createShowtime(admin);
    const ten = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"];

    await book(alice, showtime, ten);
    await book(alice, other, ten);
    await book(admin, showtime, ten.map((s) => s.replace("A", "B")));
    await book(admin, showtime, ten.map((s) => s.replace("A", "C")));
    assert.equal((await bookedSeats(showtime)).length, 30);
  });
});

describe("customers and their own bookings", () => {
  it("only see and open their own bookings", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser("CUSTOMER", "Alice");
    const bob = await createUser("CUSTOMER", "Bob");
    const { showtime } = await createShowtime(admin);
    const aliceBooking = await book(alice, showtime, ["A1"]);
    const bobBooking = await book(bob, showtime, ["B1"]);

    const list = await api.get("/bookings").set(alice.auth);
    assert.deepEqual(list.body.data.bookings.map((b) => b._id), [aliceBooking._id]);
    const own = await api.get(`/bookings/${aliceBooking._id}`).set(alice.auth);
    assert.equal(own.status, 200);
    // With what a booking page shows: the movie, screen and cinema
    assert.equal(own.body.data.booking.showtime.screen.cinema.name, "Cinema");
    assert.equal(own.body.data.booking.showtime.movie.title, "Movie");
    assert.equal((await api.get(`/bookings/${bobBooking._id}`).set(alice.auth)).status, 404);
    assert.equal((await api.get("/bookings").set(admin.auth)).body.results, 2);
  });

  it("can't change seats, confirm, touch someone else's booking or delete", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser("CUSTOMER", "Alice");
    const bob = await createUser("CUSTOMER", "Bob");
    const { showtime } = await createShowtime(admin);
    const aliceBooking = await book(alice, showtime, ["A1"]);
    const bobBooking = await book(bob, showtime, ["B1"]);

    const seats = await api.put(`/bookings/${aliceBooking._id}`).set(alice.auth).send({ seats: ["A3"] });
    assert.equal(seats.status, 400);
    assert.match(seats.body.message, /You can only cancel your booking/);
    assert.equal((await api.put(`/bookings/${aliceBooking._id}`).set(alice.auth).send({ status: "confirmed" })).status, 400);
    assert.equal((await api.put(`/bookings/${bobBooking._id}`).set(alice.auth).send({ status: "cancelled" })).status, 404);
    assert.equal((await api.delete(`/bookings/${aliceBooking._id}`).set(alice.auth)).status, 403);
    assert.deepEqual(await bookedSeats(showtime), ["A1", "B1"]);
  });
});

describe("admin updates to a booking", () => {
  it("keep the showtime's seats in sync and reprice", async () => {
    const admin = await createUser("ADMIN");
    const { showtime } = await createShowtime(admin, { price: 10 });
    const booking = await book(admin, showtime, ["A1", "A2"]);

    const res = await api.put(`/bookings/${booking._id}`).set(admin.auth).send({ seats: ["A2", "A3", "A4"] });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.booking.totalPrice, 30);
    assert.deepEqual(await bookedSeats(showtime), ["A2", "A3", "A4"]);
  });

  it("refuse a seat someone else has, and change nothing", async () => {
    const admin = await createUser("ADMIN");
    const { showtime } = await createShowtime(admin);
    const booking = await book(admin, showtime, ["A1"]);
    await book(admin, showtime, ["B1"]);

    const res = await api.put(`/bookings/${booking._id}`).set(admin.auth).send({ seats: ["A1", "B1"] });
    assert.equal(res.status, 409);
    assert.deepEqual(await bookedSeats(showtime), ["A1", "B1"]);
  });

  it("move seats between showtimes and reprice", async () => {
    const admin = await createUser("ADMIN");
    const { showtime: first } = await createShowtime(admin, { price: 10 });
    const { showtime: second } = await createShowtime(admin, { price: 12.5 });
    const booking = await book(admin, first, ["A1"]);

    const res = await api.put(`/bookings/${booking._id}`).set(admin.auth).send({ showtime: second._id, seats: ["C1"] });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.booking.totalPrice, 12.5);
    assert.deepEqual(await bookedSeats(first), []);
    assert.deepEqual(await bookedSeats(second), ["C1"]);
  });

  it("keep the charged price when only the name or status changes", async () => {
    const admin = await createUser("ADMIN");
    const { showtime } = await createShowtime(admin, { price: 10 });
    const booking = await book(admin, showtime, ["A1", "A2"]);
    await api.put(`/showTimes/${showtime._id}`).set(admin.auth).send({ price: 15 });

    const res = await api.put(`/bookings/${booking._id}`).set(admin.auth).send({ customerName: "Janet", status: "cancelled" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.booking.customerName, "Janet");
    assert.equal(res.body.data.booking.totalPrice, 20);
  });

  it("deleting a cancelled booking doesn't free a seat someone else now has", async () => {
    const admin = await createUser("ADMIN");
    const { showtime } = await createShowtime(admin);
    const first = await book(admin, showtime, ["A1"]);
    await api.put(`/bookings/${first._id}`).set(admin.auth).send({ status: "cancelled" });
    await book(admin, showtime, ["A1"]);

    assert.equal((await api.delete(`/bookings/${first._id}`).set(admin.auth)).status, 204);
    assert.deepEqual(await bookedSeats(showtime), ["A1"]);
  });
});
