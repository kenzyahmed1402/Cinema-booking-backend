import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, book, bookedSeats, createShowtime, createUser, useTestDatabase } from "./helpers.js";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import { PayPalError, setPayPalClient } from "../services/paypalService.js";

useTestDatabase();

process.env.PAYPAL_WEBHOOK_ID = "WH-TEST-1";

const SIGNATURE = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
  "paypal-transmission-id": "tx-1",
  "paypal-transmission-sig": "sig",
  "paypal-transmission-time": "2026-10-17T12:00:00Z",
};

// A fake PayPal that says whether a signature is genuine
let paypal;
beforeEach(() => {
  paypal = {
    verified: [],
    genuine: true,
    verifyWebhookSignature: async (input) => {
      paypal.verified.push(input);
      return paypal.genuine;
    },
  };
  setPayPalClient(paypal);
});

let counter = 0;

// A customer's pending $20 booking with a PayPal order waiting for capture
const awaitingCapture = async () => {
  const admin = await createUser("ADMIN");
  const alice = await createUser();
  const { showtime } = await createShowtime(admin, { price: 10 });
  const booking = await book(alice, showtime, ["A1", "A2"]);
  counter += 1;
  const payment = await Payment.create({
    booking: booking._id,
    user: alice.user._id,
    paypalOrderId: `ORDER${counter}AAAA`,
    amountCents: 2000,
    currency: "USD",
  });
  return { showtime, booking, payment };
};

const captureEvent = (payment, { id = `WH-${++counter}`, type = "PAYMENT.CAPTURE.COMPLETED", value = "20.00" } = {}) => ({
  id,
  event_type: type,
  resource: {
    id: `CAPTURE${payment.paypalOrderId}`,
    status: type === "PAYMENT.CAPTURE.COMPLETED" ? "COMPLETED" : "DECLINED",
    custom_id: String(payment.booking),
    amount: { currency_code: "USD", value },
    supplementary_data: { related_ids: { order_id: payment.paypalOrderId } },
  },
});

const refundEvent = (captureId, { refundId = `REFUND${++counter}AAAA`, value = "20.00" } = {}) => ({
  id: `WH-${++counter}`,
  event_type: "PAYMENT.CAPTURE.REFUNDED",
  resource: {
    id: refundId,
    status: "COMPLETED",
    amount: { currency_code: "USD", value },
    links: [{ rel: "up", href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}` }],
  },
});

const deliver = (event, headers = SIGNATURE) =>
  api.post("/payments/webhook").set(headers).set("Content-Type", "application/json").send(JSON.stringify(event));

const statusOf = async (doc, Model) => (await Model.findById(doc._id)).status;

describe("PayPal webhooks", () => {
  it("are refused unless PayPal confirms the signature, and nothing changes", async () => {
    const { booking, payment } = await awaitingCapture();
    const event = captureEvent(payment);

    assert.equal((await deliver(event, {})).status, 400);
    assert.equal(paypal.verified.length, 0);

    paypal.genuine = false;
    assert.equal((await deliver(event)).status, 400);
    // PayPal checks the body exactly as it was sent
    assert.equal(paypal.verified[0].rawBody, JSON.stringify(event));
    assert.equal(paypal.verified[0].webhookId, "WH-TEST-1");

    paypal.verifyWebhookSignature = async () => {
      throw new PayPalError("Could not reach PayPal: timed out");
    };
    assert.equal((await deliver(event)).status, 502);

    assert.equal(await statusOf(payment, Payment), "created");
    assert.equal(await statusOf(booking, Booking), "pending");
  });

  it("a completed capture confirms the booking once, however often it's delivered", async () => {
    const { booking, payment } = await awaitingCapture();
    const event = captureEvent(payment);

    const first = await deliver(event);
    assert.equal(first.status, 200);
    assert.equal(first.body.data.outcome, "confirmed");
    assert.equal(await statusOf(booking, Booking), "confirmed");
    assert.equal(await statusOf(payment, Payment), "captured");

    assert.equal((await deliver(event)).body.data.outcome, "duplicate");
    // The same capture in a different event (e.g. after the capture endpoint)
    assert.equal((await deliver(captureEvent(payment))).body.data.outcome, "already");
  });

  it("a capture of the wrong amount is held for review instead of confirmed", async () => {
    const { showtime, booking, payment } = await awaitingCapture();
    const res = await deliver(captureEvent(payment, { value: "0.01" }));
    assert.equal(res.body.data.outcome, "review");
    assert.equal(await statusOf(booking, Booking), "needs_review");
    assert.deepEqual(await bookedSeats(showtime), ["A1", "A2"]);
  });

  it("a denied capture fails the payment and leaves the booking waiting", async () => {
    const { booking, payment } = await awaitingCapture();
    const res = await deliver(captureEvent(payment, { type: "PAYMENT.CAPTURE.DENIED" }));
    assert.equal(res.body.data.outcome, "failed");
    assert.equal(await statusOf(payment, Payment), "failed");
    assert.equal(await statusOf(booking, Booking), "pending");
  });

  it("a refund completes a pending one, and one made outside the app holds the booking for review", async () => {
    const pending = await awaitingCapture();
    await Payment.updateOne({ _id: pending.payment._id }, { status: "refund_pending", captureId: "CAPTUREP1AAAA" });
    // The refund ID isn't stored yet, so the payment is found by its capture
    const done = await deliver(refundEvent("CAPTUREP1AAAA", { refundId: "REFUNDP1AAAA" }));
    assert.equal(done.body.data.outcome, "refunded");
    const refunded = await Payment.findById(pending.payment._id);
    assert.equal(refunded.status, "refunded");
    assert.equal(refunded.refundId, "REFUNDP1AAAA");

    const outside = await awaitingCapture();
    await Payment.updateOne({ _id: outside.payment._id }, { status: "captured", captureId: "CAPTUREO1AAAA" });
    await Booking.updateOne({ _id: outside.booking._id }, { status: "confirmed" });
    const res = await deliver(refundEvent("CAPTUREO1AAAA", { value: "5.00" }));
    assert.equal(res.body.data.outcome, "refunded_outside_app");
    assert.equal((await Payment.findById(outside.payment._id)).refundCents, 500);
    assert.equal(await statusOf(outside.booking, Booking), "needs_review");
  });

  it("an event arriving late can't undo a later state", async () => {
    const { payment } = await awaitingCapture();
    await Payment.updateOne({ _id: payment._id }, { status: "refunded", captureId: `CAPTURE${payment.paypalOrderId}` });

    assert.equal((await deliver(captureEvent(payment))).body.data.outcome, "already");
    assert.equal((await deliver(captureEvent(payment, { type: "PAYMENT.CAPTURE.DENIED" }))).body.data.outcome, "no_change");
    assert.equal(await statusOf(payment, Payment), "refunded");
  });
});
