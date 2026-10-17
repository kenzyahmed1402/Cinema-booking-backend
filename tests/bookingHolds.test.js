import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { api, book, bookedSeats, createShowtime, createUser, useTestDatabase } from "./helpers.js";
import Booking from "../models/Booking.js";
import { expireHolds, startHoldSweeper } from "../utils/bookingHolds.js";
import { findConfigProblems } from "../config/env.js";

useTestDatabase();

const MINUTE = 60 * 1000;

// Moves a booking's hold deadline into the past, as if time had passed
const runOut = (booking) =>
  Booking.updateOne({ _id: booking._id }, { holdExpiresAt: new Date(Date.now() - MINUTE) });

const statusOf = async (booking) => (await Booking.findById(booking._id)).status;

describe("booking holds", () => {
  it("a new booking holds its seats for 10 minutes, and keeps them until then", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser();
    const { showtime } = await createShowtime(admin);

    const before = Date.now();
    const booking = await book(alice, showtime, ["A1", "A2"]);
    const expiresIn = new Date(booking.holdExpiresAt).getTime() - before;
    assert.equal(booking.status, "pending");
    assert.ok(expiresIn > 9.9 * MINUTE && expiresIn <= 10 * MINUTE + 5000, `${expiresIn} ms`);

    assert.equal(await expireHolds(), 0);
    assert.deepEqual(await bookedSeats(showtime), ["A1", "A2"]);
  });

  it("an expired hold frees its seats for anyone, and no longer counts towards the seat limit", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser();
    const bob = await createUser();
    const { showtime } = await createShowtime(admin);
    const tenSeats = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"];
    const booking = await book(alice, showtime, tenSeats);

    await runOut(booking);

    // Reading the showtime expires the hold first, so the seats show as free
    assert.deepEqual(await bookedSeats(showtime), []);
    assert.equal(await statusOf(booking), "expired");
    await book(bob, showtime, ["A1"]);
    await book(alice, showtime, ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10"]);
  });

  it("only touches pending bookings", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser();
    const { showtime } = await createShowtime(admin);
    const confirmed = await book(alice, showtime, ["A1"]);
    const cancelled = await book(alice, showtime, ["A2"]);
    await Booking.updateOne({ _id: confirmed._id }, { status: "confirmed" });
    await api.put(`/bookings/${cancelled._id}`).set(alice.auth).send({ status: "cancelled" });
    await runOut(confirmed);
    await runOut(cancelled);

    assert.equal(await expireHolds(), 0);
    assert.equal(await statusOf(confirmed), "confirmed");
    assert.equal(await statusOf(cancelled), "cancelled");
    assert.deepEqual(await bookedSeats(showtime), ["A1"]);
  });

  it("releases the seats once when several sweeps run at the same time", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser();
    const bob = await createUser();
    const { showtime } = await createShowtime(admin);
    const booking = await book(alice, showtime, ["C1", "C2"]);
    await runOut(booking);

    const counts = await Promise.all([expireHolds(), expireHolds(), expireHolds()]);
    assert.equal(counts.reduce((a, b) => a + b, 0), 1);

    // A later sweep must not free seats that someone has booked since
    await book(bob, showtime, ["C1"]);
    assert.equal(await expireHolds(), 0);
    assert.deepEqual(await bookedSeats(showtime), ["C1"]);
  });

  it("an expired hold doesn't block deleting the showtime", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser();
    const { showtime } = await createShowtime(admin);
    const booking = await book(alice, showtime, ["A1"]);

    assert.equal((await api.delete(`/showTimes/${showtime._id}`).set(admin.auth)).status, 409);
    await runOut(booking);
    assert.equal((await api.delete(`/showTimes/${showtime._id}`).set(admin.auth)).status, 204);
  });

  it("the background sweeper expires holds without any request", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser();
    const { showtime } = await createShowtime(admin);
    const booking = await book(alice, showtime, ["D4"]);
    await runOut(booking);

    const timer = startHoldSweeper({ intervalMs: 20 });
    try {
      for (let i = 0; i < 50 && (await statusOf(booking)) !== "expired"; i++) {
        await wait(20);
      }
    } finally {
      clearInterval(timer);
    }
    assert.equal(await statusOf(booking), "expired");
  });

  it("HOLD_MINUTES must be a whole number from 1 to 60", () => {
    const good = { MONGO_URI: "x", JWT_SECRET: "a".repeat(64), PAYPAL_ENV: "sandbox" };
    assert.deepEqual(findConfigProblems({ ...good, HOLD_MINUTES: "15" }), []);
    for (const HOLD_MINUTES of ["0", "61", "2.5", "ten"]) {
      assert.deepEqual(findConfigProblems({ ...good, HOLD_MINUTES }), [
        "HOLD_MINUTES must be a whole number from 1 to 60",
      ]);
    }
  });
});
