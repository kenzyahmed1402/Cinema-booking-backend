import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, book, bookedSeats, createShowtime, createUser, useTestDatabase } from "./helpers.js";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import { PayPalError, setPayPalClient } from "../services/paypalService.js";

useTestDatabase();

// A fake PayPal client. `capture` decides what a capture returns; by default
// a completed capture of exactly what was ordered.
let paypal;
const fakePayPal = () => {
  const fake = {
    orders: [],
    captures: 0,
    // Every order gets its own ID, like at PayPal
    createOrder: async (order) => {
      fake.orders.push(order);
      return { orderId: `ORDER${String(fake.orders.length).padStart(5, "0")}`, status: "CREATED" };
    },
    capture: (order) => ({
      orderId: `ORDER${String(fake.orders.length).padStart(5, "0")}`,
      orderStatus: "COMPLETED",
      captureStatus: "COMPLETED",
      captureId: `CAPTURE${String(fake.captures).padStart(5, "0")}`,
      bookingId: String(order.bookingId),
      amountCents: order.amountCents,
      currency: order.currency,
    }),
    captureOrder: async () => {
      fake.captures += 1;
      return fake.capture(fake.orders.at(-1));
    },
    refunds: [],
    refundCapture: async (captureId, options) => {
      fake.refunds.push({ captureId, ...options });
      return { refundId: `REFUND${fake.refunds.length}AAAA`, status: "COMPLETED" };
    },
  };
  return fake;
};

beforeEach(() => {
  paypal = fakePayPal();
  setPayPalClient(paypal);
});

// A customer with a pending 2-seat booking at $10 a seat
const setup = async () => {
  const admin = await createUser("ADMIN");
  const alice = await createUser();
  const { showtime } = await createShowtime(admin, { price: 10 });
  const booking = await book(alice, showtime, ["A1", "A2"]);
  return { admin, alice, showtime, booking };
};

const order = (user, booking) => api.post("/payments/orders").set(user.auth).send({ booking: booking._id });
// Captures the booking's PayPal order
const capture = async (user, booking) => {
  const { paypalOrderId } = await Payment.findOne({ booking: booking._id });
  return api.post("/payments/capture").set(user.auth).send({ orderId: paypalOrderId });
};
const statusOf = async (booking) => (await Booking.findById(booking._id)).status;

describe("paying for a booking", () => {
  it("orders the server's total, confirms only after the capture, and a repeat changes nothing", async () => {
    const { alice, showtime, booking } = await setup();

    const created = await order(alice, booking);
    assert.equal(created.status, 201);
    assert.equal(created.body.data.payment.amountCents, 2000);
    assert.equal(created.body.data.payment.status, "created");
    assert.equal(paypal.orders[0].amountCents, 2000);
    assert.equal(await statusOf(booking), "pending");

    // Asking again returns the same order instead of a second one
    assert.equal((await order(alice, booking)).status, 200);
    assert.equal(paypal.orders.length, 1);

    const paid = await capture(alice, booking);
    assert.equal(paid.status, 200);
    assert.equal(paid.body.data.booking.status, "confirmed");
    assert.equal(paid.body.data.payment.status, "captured");
    assert.deepEqual(await bookedSeats(showtime), ["A1", "A2"]);

    assert.equal((await capture(alice, booking)).status, 200);
    assert.equal(paypal.captures, 1);
  });

  it("only the booking's owner can pay, and only while it's pending with time left", async () => {
    const { alice, booking } = await setup();
    const bob = await createUser();

    assert.equal((await order(bob, booking)).status, 404);
    await Booking.updateOne({ _id: booking._id }, { holdExpiresAt: new Date(Date.now() - 1000) });
    assert.equal((await order(alice, booking)).status, 409);
    assert.equal(await statusOf(booking), "expired");
    assert.equal(paypal.orders.length, 0);
  });

  it("someone else can't capture or see a customer's payment", async () => {
    const { alice, booking } = await setup();
    const bob = await createUser();
    const { body } = await order(alice, booking);

    assert.equal((await capture(bob, booking)).status, 404);
    assert.equal((await api.get(`/payments/${body.data.payment._id}`).set(bob.auth)).status, 404);
    assert.equal((await api.get(`/payments/${body.data.payment._id}`).set(alice.auth)).status, 200);
    assert.equal(paypal.captures, 0);
  });

  it("doesn't take the money once the hold has run out", async () => {
    const { alice, showtime, booking } = await setup();
    await order(alice, booking);
    await Booking.updateOne({ _id: booking._id }, { holdExpiresAt: new Date(Date.now() - 1000) });

    assert.equal((await capture(alice, booking)).status, 409);
    assert.equal(paypal.captures, 0);
    assert.equal((await Payment.findOne()).status, "failed");
    assert.deepEqual(await bookedSeats(showtime), []);
  });

  it("keeps the booking and payment for review when PayPal reports something unexpected", async () => {
    const completed = paypal.capture;
    for (const wrong of [{ amountCents: 1 }, { currency: "EUR" }, { bookingId: "someone-else" }, { captureStatus: "PENDING" }]) {
      const { alice, showtime, booking } = await setup();
      paypal.capture = (o) => ({ ...completed(o), ...wrong });
      await order(alice, booking);

      assert.equal((await capture(alice, booking)).status, 409, JSON.stringify(wrong));
      assert.equal(await statusOf(booking), "needs_review");
      const payment = await Payment.findOne({ booking: booking._id });
      assert.equal(payment.status, "needs_review");
      assert.ok(payment.captureId, "the capture is recorded for the refund");
      assert.deepEqual(await bookedSeats(showtime), ["A1", "A2"]);
    }
  });

  it("refunds the money if the booking is cancelled while PayPal captures", async () => {
    const { alice, booking } = await setup();
    await order(alice, booking);
    paypal.captureOrder = async () => {
      // The customer cancels in another tab while PayPal takes the money
      await Booking.updateOne({ _id: booking._id }, { status: "cancelled" });
      return paypal.capture(paypal.orders.at(-1));
    };

    const res = await capture(alice, booking);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /was refunded/);
    assert.equal(await statusOf(booking), "cancelled");
    assert.equal((await Payment.findOne()).status, "refunded");
    assert.equal(paypal.refunds.length, 1);
  });

  it("a declined payment can be retried, and PayPal outages don't change anything", async () => {
    const { alice, booking } = await setup();
    await order(alice, booking);

    paypal.captureOrder = async () => {
      throw new PayPalError("PayPal request failed with status 422", { status: 422, name: "UNPROCESSABLE_ENTITY" });
    };
    assert.equal((await capture(alice, booking)).status, 422);
    paypal.captureOrder = async () => {
      throw new PayPalError("Could not reach PayPal: timed out");
    };
    assert.equal((await capture(alice, booking)).status, 502);
    assert.equal(await statusOf(booking), "pending");
    assert.equal((await Payment.findOne()).status, "created");
  });

  it("the seats of a booking being paid for can't be changed", async () => {
    const { admin, alice, booking } = await setup();
    await order(alice, booking);

    const res = await api.put(`/bookings/${booking._id}`).set(admin.auth).send({ seats: ["C1"] });
    assert.equal(res.status, 409);
  });
});
