import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, book, bookedSeats, createShowtime, createUser, useTestDatabase } from "./helpers.js";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import { PayPalError, setPayPalClient } from "../services/paypalService.js";
import { quoteCancellation } from "../utils/cancellationPolicy.js";

useTestDatabase();

const HOUR = 60 * 60 * 1000;

// A fake PayPal that records refunds; `refund` decides the answer
let paypal;
beforeEach(() => {
  paypal = {
    refunds: [],
    refund: () => ({ status: "COMPLETED" }),
    refundCapture: async (captureId, options) => {
      paypal.refunds.push({ captureId, ...options });
      return { refundId: `REFUND${paypal.refunds.length}AAAA`, amountCents: options.amountCents, ...paypal.refund() };
    },
  };
  setPayPalClient(paypal);
});

let captureCount = 0;

// A customer's paid ($20, 2 seats) booking for a show starting `hoursAhead`
// from now, with its captured payment
const paidBooking = async ({ hoursAhead = 48, status = "confirmed", paymentStatus = "captured" } = {}) => {
  const admin = await createUser("ADMIN");
  const alice = await createUser();
  const startTime = new Date(Date.now() + hoursAhead * HOUR).toISOString();
  const { showtime } = await createShowtime(admin, { price: 10, startTime });
  const booking = await book(alice, showtime, ["A1", "A2"]);
  await Booking.updateOne({ _id: booking._id }, { status });
  captureCount += 1;
  const payment = await Payment.create({
    booking: booking._id,
    user: alice.user._id,
    paypalOrderId: `ORDER${captureCount}AAAA`,
    captureId: `CAPTURE${captureCount}AAAA`,
    amountCents: 2000,
    currency: "USD",
    status: paymentStatus,
  });
  return { admin, alice, showtime, booking, payment };
};

const quote = (user, booking) => api.get(`/bookings/${booking._id}/cancellation-quote`).set(user.auth);
const cancel = (user, booking, body = { confirm: true }) => api.post(`/bookings/${booking._id}/cancel`).set(user.auth).send(body);

describe("cancellation policy", () => {
  it("refunds 100% from 24 hours before, 50% from 2 hours, nothing in the last 2 hours", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    const at = (hours) => new Date(now.getTime() + hours * HOUR);
    assert.deepEqual(quoteCancellation({ startTime: at(24), paidCents: 2001, now }), { allowed: true, refundPercent: 100, refundCents: 2001 });
    assert.equal(quoteCancellation({ startTime: at(23.9), paidCents: 2001, now }).refundCents, 1000);
    assert.equal(quoteCancellation({ startTime: at(2), paidCents: 2000, now }).refundPercent, 50);
    assert.equal(quoteCancellation({ startTime: at(1.9), paidCents: 2000, now }).allowed, false);
  });
});

describe("cancelling a paid booking", () => {
  it("quotes, needs an explicit yes, refunds in full and frees the seats, once", async () => {
    const { alice, showtime, booking } = await paidBooking({ hoursAhead: 48 });

    const q = await quote(alice, booking);
    assert.equal(q.status, 200);
    assert.equal(q.body.data.quote.refundPercent, 100);
    assert.equal(q.body.data.quote.refundCents, 2000);

    assert.equal((await cancel(alice, booking, {})).status, 400);
    assert.equal((await cancel(alice, booking, { confirm: "yes" })).status, 400);
    assert.equal(paypal.refunds.length, 0);

    const res = await cancel(alice, booking);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.booking.status, "refunded");
    assert.equal(res.body.data.payment.status, "refunded");
    assert.ok(res.body.data.payment.refundId);
    // A full refund refunds the whole capture
    assert.deepEqual(paypal.refunds[0], { captureId: "CAPTURE1AAAA", amountCents: undefined, currency: "USD", requestId: "refund-CAPTURE1AAAA" });
    assert.deepEqual(await bookedSeats(showtime), []);

    assert.equal((await cancel(alice, booking)).status, 409);
    assert.equal(paypal.refunds.length, 1);
  });

  it("refunds half between 2 and 24 hours before, and refuses in the last 2 hours", async () => {
    const half = await paidBooking({ hoursAhead: 5 });
    const res = await cancel(half.alice, half.booking);
    assert.equal(res.status, 200);
    assert.equal(paypal.refunds[0].amountCents, 1000);
    assert.equal(res.body.data.payment.refundCents, 1000);

    const late = await paidBooking({ hoursAhead: 1 });
    assert.equal((await quote(late.alice, late.booking)).body.data.quote.allowed, false);
    assert.equal((await cancel(late.alice, late.booking)).status, 409);
    assert.equal(paypal.refunds.length, 1);
    assert.equal((await Booking.findById(late.booking._id)).status, "confirmed");
  });

  it("only for the customer's own paid booking", async () => {
    const { booking } = await paidBooking();
    const bob = await createUser();
    assert.equal((await quote(bob, booking)).status, 404);
    assert.equal((await cancel(bob, booking)).status, 404);

    const admin = await createUser("ADMIN");
    const alice = await createUser();
    const { showtime } = await createShowtime(admin);
    const unpaid = await book(alice, showtime, ["B1"]);
    const res = await cancel(alice, unpaid);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /isn't paid/);
    assert.equal(paypal.refunds.length, 0);
  });

  it("nothing counts as refunded if PayPal fails; a pending refund is shown as pending", async () => {
    const { alice, showtime, booking, payment } = await paidBooking();
    paypal.refundCapture = async () => {
      throw new PayPalError("Could not reach PayPal: timed out");
    };
    assert.equal((await cancel(alice, booking)).status, 502);
    assert.equal((await Payment.findById(payment._id)).status, "captured");
    assert.equal((await Booking.findById(booking._id)).status, "confirmed");
    assert.deepEqual(await bookedSeats(showtime), ["A1", "A2"]);

    paypal.refundCapture = async () => ({ refundId: "REFUNDPENDING1", status: "PENDING" });
    const res = await cancel(alice, booking);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.payment.status, "refund_pending");
    assert.equal(res.body.data.booking.status, "refunded");
  });
});

describe("refunding a payment in review", () => {
  it("an admin refunds it in full and its seats come back; customers can't", async () => {
    const { admin, alice, showtime, booking, payment } = await paidBooking({ status: "needs_review", paymentStatus: "needs_review" });

    assert.equal((await api.post(`/payments/${payment._id}/refund`).set(alice.auth)).status, 403);
    const res = await api.post(`/payments/${payment._id}/refund`).set(admin.auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.payment.status, "refunded");
    assert.equal(res.body.data.booking.status, "refunded");
    assert.equal(paypal.refunds[0].amountCents, undefined);
    assert.deepEqual(await bookedSeats(showtime), []);

    assert.equal((await api.post(`/payments/${payment._id}/refund`).set(admin.auth)).status, 409);
  });
});
