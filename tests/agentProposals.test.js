import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, book, bookedSeats, createShowtime, createUser, useTestDatabase } from "./helpers.js";
import { runTool } from "../services/agentTools.js";
import { setPayPalClient } from "../services/paypalService.js";
import AgentProposal from "../models/AgentProposal.js";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import Showtime from "../models/showTime.js";

useTestDatabase();

const HOUR = 60 * 60 * 1000;

// A fake PayPal that records refunds
let paypal;
beforeEach(() => {
  paypal = {
    refunds: [],
    refundCapture: async (captureId, options) => {
      paypal.refunds.push({ captureId, ...options });
      return { refundId: `REFUND${paypal.refunds.length}AAAA`, amountCents: options.amountCents, status: "COMPLETED" };
    },
  };
  setPayPalClient(paypal);
});

const setup = async ({ hoursAhead = 48 } = {}) => {
  const admin = await createUser("ADMIN");
  const alice = await createUser();
  const bob = await createUser();
  const startTime = new Date(Date.now() + hoursAhead * HOUR).toISOString();
  const { showtime } = await createShowtime(admin, { price: 10, startTime });
  return { admin, alice, bob, showtime };
};

const proposeBooking = async (user, showtime, seats) =>
  (await runTool(user.user, "proposeBooking", { showtime: String(showtime._id), seats })).proposal;

const confirm = (user, proposal) => api.post(`/agent/proposals/${proposal}/confirm`).set(user.auth);

let captureCount = 0;

// A paid ($20, 2 seats) booking with its captured payment
const paidBooking = async (user, showtime, seats = ["A1", "A2"]) => {
  const booking = await book(user, showtime, seats);
  await Booking.updateOne({ _id: booking._id }, { status: "confirmed" });
  captureCount += 1;
  await Payment.create({
    booking: booking._id,
    user: user.user._id,
    paypalOrderId: `ORDERPROP${captureCount}AAAA`,
    captureId: `CAPTUREPROP${captureCount}AAAA`,
    amountCents: 2000,
    currency: "USD",
    status: "captured",
  });
  return booking;
};

describe("confirming a booking proposal", () => {
  it("holds the seats once, even when confirmed twice", async () => {
    const { alice, showtime } = await setup();
    const proposal = await proposeBooking(alice, showtime, ["B1", "B2"]);

    const shown = await api.get(`/agent/proposals/${proposal}`).set(alice.auth);
    assert.equal(shown.status, 200);
    assert.equal(shown.body.data.proposal.status, "open");
    assert.equal(shown.body.data.proposal.card.totalCents, 2000);

    const first = await confirm(alice, proposal);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.proposal.status, "confirmed");
    const booking = first.body.data.booking;
    assert.equal(booking.status, "pending");
    assert.equal(booking.totalPrice, 20);
    assert.deepEqual(booking.seats, ["B1", "B2"]);

    const second = await confirm(alice, proposal);
    assert.equal(second.status, 200);
    assert.equal(second.body.data.booking._id, booking._id);
    assert.equal(await Booking.countDocuments(), 1);
    assert.deepEqual(await bookedSeats(showtime), ["B1", "B2"]);
  });

  it("needs a login and hides other users' proposals", async () => {
    const { alice, bob, showtime } = await setup();
    const proposal = await proposeBooking(alice, showtime, ["C1"]);

    assert.equal((await api.post(`/agent/proposals/${proposal}/confirm`)).status, 401);
    assert.equal((await api.get(`/agent/proposals/${proposal}`).set(bob.auth)).status, 404);
    assert.equal((await confirm(bob, proposal)).status, 404);
    assert.equal(await Booking.countDocuments(), 0);
  });

  it("refuses seats taken since the proposal, and stays open", async () => {
    const { alice, bob, showtime } = await setup();
    const proposal = await proposeBooking(alice, showtime, ["D1"]);
    await book(bob, showtime, ["D1"]);

    const res = await confirm(alice, proposal);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /already booked/);
    assert.equal((await AgentProposal.findById(proposal)).status, "open");
    assert.equal(await Booking.countDocuments({ user: alice.user._id }), 0);
  });

  it("refuses a price that changed since the proposal", async () => {
    const { alice, showtime } = await setup();
    const proposal = await proposeBooking(alice, showtime, ["E1", "E2"]);
    await Showtime.updateOne({ _id: showtime._id }, { price: 12 });

    const res = await confirm(alice, proposal);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /\$24\.00 instead of \$20\.00/);
    assert.equal(await Booking.countDocuments(), 0);
    assert.deepEqual(await bookedSeats(showtime), []);
  });

  it("refuses an expired proposal", async () => {
    const { alice, showtime } = await setup();
    const proposal = await proposeBooking(alice, showtime, ["F1"]);
    await AgentProposal.updateOne({ _id: proposal }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await confirm(alice, proposal);
    assert.equal(res.status, 410);
    assert.equal(await Booking.countDocuments(), 0);
  });
});

describe("confirming a cancellation proposal", () => {
  it("cancels the paid booking with the refund the card showed, once", async () => {
    const { alice, showtime } = await setup({ hoursAhead: 48 });
    const booking = await paidBooking(alice, showtime);

    const { proposal, card } = await runTool(alice.user, "proposeCancellation", { booking: String(booking._id) });
    assert.equal(card.type, "cancellation");
    assert.equal(card.refundCents, 2000);
    assert.equal(card.refundPercent, 100);
    assert.equal((await Booking.findById(booking._id)).status, "confirmed");
    assert.equal(paypal.refunds.length, 0);

    const res = await confirm(alice, proposal);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.booking.status, "refunded");
    assert.equal(paypal.refunds.length, 1);
    assert.deepEqual(await bookedSeats(showtime), []);

    const again = await confirm(alice, proposal);
    assert.equal(again.status, 200);
    assert.equal(again.body.data.booking.status, "refunded");
    assert.equal(paypal.refunds.length, 1);
  });

  it("refuses when the refund changed since the proposal, refunding nothing", async () => {
    const { alice, showtime } = await setup({ hoursAhead: 48 });
    const booking = await paidBooking(alice, showtime);
    const { proposal } = await runTool(alice.user, "proposeCancellation", { booking: String(booking._id) });

    // The show is now 5 hours away: the policy refunds 50%
    await Showtime.updateOne({ _id: showtime._id }, { startTime: new Date(Date.now() + 5 * HOUR) });

    const res = await confirm(alice, proposal);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /\$10\.00 instead of \$20\.00/);
    assert.equal(paypal.refunds.length, 0);
    assert.equal((await Booking.findById(booking._id)).status, "confirmed");
    assert.equal((await AgentProposal.findById(proposal)).status, "open");
  });

  it("won't propose cancelling a show that starts within 2 hours", async () => {
    const { alice, showtime } = await setup({ hoursAhead: 48 });
    const booking = await paidBooking(alice, showtime);
    await Showtime.updateOne({ _id: showtime._id }, { startTime: new Date(Date.now() + HOUR) });

    await assert.rejects(runTool(alice.user, "proposeCancellation", { booking: String(booking._id) }), (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /less than 2 hours/);
      return true;
    });
    assert.equal(await AgentProposal.countDocuments(), 0);
  });
});
