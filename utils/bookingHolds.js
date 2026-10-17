import Booking from "../models/Booking.js";
import { releaseSeats } from "./showtimeSeats.js";

// How long an unpaid booking holds its seats
export const DEFAULT_HOLD_MINUTES = 10;
const MINUTE = 60 * 1000;

export const holdMinutes = () => Number(process.env.HOLD_MINUTES) || DEFAULT_HOLD_MINUTES;

export const holdExpiry = (from = new Date()) => new Date(from.getTime() + holdMinutes() * MINUTE);

// Moves pending bookings whose hold has run out to "expired" and gives their
// seats back. Each booking is switched with one conditional update, so when
// several sweeps run at once only one of them releases its seats. Returns
// how many bookings expired.
export const expireHolds = async (now = new Date()) => {
  const overdue = { status: "pending", holdExpiresAt: { $lte: now } };
  const candidates = await Booking.find(overdue).select("_id");

  let expired = 0;
  for (const { _id } of candidates) {
    const booking = await Booking.findOneAndUpdate(
      { _id, ...overdue },
      { status: "expired" },
      { returnDocument: "after" }
    );
    if (booking) {
      await releaseSeats(booking.showtime, booking.seats);
      expired += 1;
    }
  }
  return expired;
};

// Expires overdue holds before the request reads or books seats, so nobody
// sees seats as taken by a hold that has already run out
export const expireOverdueHolds = async (req, res, next) => {
  try {
    await expireHolds();
    next();
  } catch (err) {
    next(err);
  }
};

// Also expires holds in the background, so seats come back even when nobody
// is browsing. Returns the timer so it can be stopped.
export const startHoldSweeper = ({ intervalMs = MINUTE } = {}) => {
  const timer = setInterval(() => {
    expireHolds().catch((err) => {
      console.error(`Expiring booking holds failed: ${err.message}`);
    });
  }, intervalMs);
  // Don't keep the process alive just for the sweeper
  timer.unref();
  return timer;
};
