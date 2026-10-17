import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, book, bookedSeats, createShowtime, createUser, useTestDatabase } from "./helpers.js";
import Booking from "../models/Booking.js";

useTestDatabase();

// Puts a booking into a state that only the server itself can set (the
// payment flow or hold expiry), straight in the database
const setStatus = (booking, status) => Booking.updateOne({ _id: booking._id }, { status });

const statusOf = async (booking) => (await Booking.findById(booking._id)).status;

const setup = async () => {
  const admin = await createUser("ADMIN");
  const alice = await createUser();
  const { showtime } = await createShowtime(admin, { price: 10 });
  return { admin, alice, showtime };
};

describe("booking status changes", () => {
  it("a customer can cancel an unpaid booking; sending it again changes nothing", async () => {
    const { alice, showtime } = await setup();
    const booking = await book(alice, showtime, ["A1"]);

    for (let i = 0; i < 2; i++) {
      const res = await api.put(`/bookings/${booking._id}`).set(alice.auth).send({ status: "cancelled" });
      assert.equal(res.status, 200);
    }
    assert.equal(await statusOf(booking), "cancelled");
    assert.deepEqual(await bookedSeats(showtime), []);
  });

  it("a customer can't cancel a paid booking without a refund", async () => {
    const { alice, showtime } = await setup();
    const statuses = ["confirmed", "needs_review", "refunded"];
    for (const [i, status] of statuses.entries()) {
      const booking = await book(alice, showtime, [`B${i + 1}`]);
      await setStatus(booking, status);

      const res = await api.put(`/bookings/${booking._id}`).set(alice.auth).send({ status: "cancelled" });
      assert.equal(res.status, 409, status);
      assert.match(res.body.message, /refund/);
      assert.equal(await statusOf(booking), status);
    }
  });

  it("an expired booking can't be cancelled or revived", async () => {
    const { admin, alice, showtime } = await setup();
    const booking = await book(alice, showtime, ["A1"]);
    await setStatus(booking, "expired");

    assert.equal((await api.put(`/bookings/${booking._id}`).set(alice.auth).send({ status: "cancelled" })).status, 409);
    assert.equal((await api.put(`/bookings/${booking._id}`).set(admin.auth).send({ status: "cancelled" })).status, 409);
    assert.equal(await statusOf(booking), "expired");
  });

  it("nobody can confirm, refund, expire or revive a booking through the API", async () => {
    const { admin, alice, showtime } = await setup();
    const booking = await book(alice, showtime, ["A1"]);

    for (const status of ["confirmed", "refunded", "expired", "needs_review", "pending"]) {
      assert.equal((await api.put(`/bookings/${booking._id}`).set(admin.auth).send({ status })).status, 400, `admin ${status}`);
      assert.equal((await api.put(`/bookings/${booking._id}`).set(alice.auth).send({ status })).status, 400, `customer ${status}`);
    }
    assert.equal(await statusOf(booking), "pending");
  });

  it("an admin can cancel an unpaid booking but not a paid one", async () => {
    const { admin, alice, showtime } = await setup();
    const unpaid = await book(alice, showtime, ["A1"]);
    const paid = await book(alice, showtime, ["A2"]);
    await setStatus(paid, "confirmed");

    assert.equal((await api.put(`/bookings/${unpaid._id}`).set(admin.auth).send({ status: "cancelled" })).status, 200);
    assert.equal((await api.put(`/bookings/${paid._id}`).set(admin.auth).send({ status: "cancelled" })).status, 409);
    assert.deepEqual(await bookedSeats(showtime), ["A2"]);
  });
});

describe("paid bookings", () => {
  it("keep their seats, showtime and price, but the name can be corrected", async () => {
    const { admin, alice, showtime } = await setup();
    const { showtime: other } = await createShowtime(admin, { price: 20 });
    const booking = await book(alice, showtime, ["A1", "A2"]);
    await setStatus(booking, "confirmed");

    const seats = await api.put(`/bookings/${booking._id}`).set(admin.auth).send({ seats: ["C1"] });
    assert.equal(seats.status, 409);
    const move = await api.put(`/bookings/${booking._id}`).set(admin.auth).send({ showtime: other._id, seats: ["C1"] });
    assert.equal(move.status, 409);
    assert.deepEqual(await bookedSeats(showtime), ["A1", "A2"]);
    assert.deepEqual(await bookedSeats(other), []);

    const rename = await api.put(`/bookings/${booking._id}`).set(admin.auth).send({ customerName: "Alice Smith" });
    assert.equal(rename.status, 200);
    assert.equal(rename.body.data.booking.customerName, "Alice Smith");
    assert.equal(rename.body.data.booking.totalPrice, 20);
    assert.equal(rename.body.data.booking.status, "confirmed");
  });

  it("seats can't be changed on a cancelled or expired booking either", async () => {
    const { admin, alice, showtime } = await setup();
    for (const status of ["cancelled", "expired"]) {
      const booking = await book(alice, showtime, ["D1"]);
      await api.put(`/bookings/${booking._id}`).set(admin.auth).send({ status: "cancelled" });
      await setStatus(booking, status);

      const res = await api.put(`/bookings/${booking._id}`).set(admin.auth).send({ seats: ["D2"] });
      assert.equal(res.status, 409, status);
      assert.deepEqual(await bookedSeats(showtime), []);
    }
  });

  it("can't be deleted; unpaid and cancelled bookings can", async () => {
    const { admin, alice, showtime } = await setup();
    const statuses = ["confirmed", "needs_review", "refunded"];
    for (const [i, status] of statuses.entries()) {
      const booking = await book(alice, showtime, [`E${i + 1}`]);
      await setStatus(booking, status);
      const res = await api.delete(`/bookings/${booking._id}`).set(admin.auth);
      assert.equal(res.status, 409, status);
      assert.match(res.body.message, /payment/);
      assert.ok(await Booking.exists({ _id: booking._id }));
    }

    const pending = await book(alice, showtime, ["F1"]);
    const cancelled = await book(alice, showtime, ["F2"]);
    await api.put(`/bookings/${cancelled._id}`).set(alice.auth).send({ status: "cancelled" });
    assert.equal((await api.delete(`/bookings/${pending._id}`).set(admin.auth)).status, 204);
    assert.equal((await api.delete(`/bookings/${cancelled._id}`).set(admin.auth)).status, 204);
    assert.deepEqual(await bookedSeats(showtime), ["E1", "E2", "E3"]);
  });
});

describe("concurrent changes", () => {
  it("a cancel doesn't overwrite a status that changed after it was checked", async (t) => {
    const { alice, showtime } = await setup();
    const booking = await book(alice, showtime, ["A1"]);

    // Confirm the booking right after the cancel request has read it, as a
    // payment completing at the same moment would
    const findOne = Booking.findOne;
    let raced = false;
    t.mock.method(Booking, "findOne", function (...args) {
      const query = findOne.apply(this, args);
      if (raced) return query;
      raced = true;
      return query.then(async (doc) => {
        await setStatus(booking, "confirmed");
        return doc;
      });
    });

    const res = await api.put(`/bookings/${booking._id}`).set(alice.auth).send({ status: "cancelled" });

    assert.equal(res.status, 409);
    assert.equal(await statusOf(booking), "confirmed");
    assert.deepEqual(await bookedSeats(showtime), ["A1"]);
  });
});
