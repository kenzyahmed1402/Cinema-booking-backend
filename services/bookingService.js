import Booking, { MAX_SEATS, SEAT_HOLDING_STATUSES } from "../models/Booking.js";
import Showtime from "../models/showTime.js";
import Payment from "../models/Payment.js";
import AppError from "../utils/AppError.js";
import { assertSeatsFit } from "../utils/seatLayout.js";
import { releaseSeats, reserveSeats } from "../utils/showtimeSeats.js";
import { holdExpiry } from "../utils/bookingHolds.js";
import { POLICY_TEXT, quoteCancellation } from "../utils/cancellationPolicy.js";
import { refundPayment } from "./refundService.js";

// The booking rules shared by the REST endpoints and the assistant's tools,
// so both check and price everything the same way. `user` is always the
// logged-in user, never something a client or the model sent.

// The server always calculates the price; rounded to cents to avoid
// floating point leftovers like 0.30000000000000004
export const priceFor = (showtimeDoc, seats) =>
  Math.round(showtimeDoc.price * seats.length * 100) / 100;

export const formatCents = (cents) => `$${(cents / 100).toFixed(2)}`;

// Customers can only reach their own bookings; admins can reach all of them.
// Someone else's booking looks "not found" so its ID isn't confirmed.
export const accessFilter = (user) => (user.role === "ADMIN" ? {} : { user: user._id });

// Loads a showtime that can still be booked: it exists and hasn't started
const bookableShowtime = async (id) => {
  const showtimeDoc = await Showtime.findById(id).populate("screen");
  if (!showtimeDoc) {
    throw new AppError("Showtime not found", 404);
  }
  if (showtimeDoc.startTime <= new Date()) {
    throw new AppError("This showtime has already started", 409);
  }
  return showtimeDoc;
};

const takenSeats = (showtimeDoc, seats) => seats.filter((seat) => showtimeDoc.bookedSeats.includes(seat));

// What these seats would cost, calculated by the server, without reserving
// anything. Refuses seats that don't exist or are taken.
export const quoteSeats = async ({ showtime, seats }) => {
  const showtimeDoc = await bookableShowtime(showtime);
  assertSeatsFit(showtimeDoc.screen, seats, { alreadyBooked: showtimeDoc.bookedSeats.length });

  const taken = takenSeats(showtimeDoc, seats);
  if (taken.length > 0) {
    throw new AppError(`Seats already booked: ${taken.join(", ")}`, 409);
  }

  return {
    showtime: showtimeDoc._id,
    startTime: showtimeDoc.startTime,
    seats,
    pricePerSeat: showtimeDoc.price,
    totalPrice: priceFor(showtimeDoc, seats),
    totalCents: Math.round(priceFor(showtimeDoc, seats) * 100),
    currency: "USD",
  };
};

// Reserves the seats and creates a pending booking that holds them until
// holdExpiresAt; unpaid by then, it expires and the seats come back
export const holdSeats = async (user, { showtime, seats }) => {
  const showtimeDoc = await bookableShowtime(showtime);

  assertSeatsFit(showtimeDoc.screen, seats, {
    alreadyBooked: showtimeDoc.bookedSeats.length,
  });

  // Customers can hold at most MAX_SEATS active seats per showtime, across
  // all their bookings. Admins are exempt, e.g. for group bookings.
  if (user.role !== "ADMIN") {
    const mine = await Booking.find({
      user: user._id,
      showtime,
      status: { $in: SEAT_HOLDING_STATUSES },
    });
    const held = mine.reduce((count, booking) => count + booking.seats.length, 0);
    if (held + seats.length > MAX_SEATS) {
      throw new AppError(
        `You can book at most ${MAX_SEATS} seats per showtime (you already have ${held})`,
        409
      );
    }
  }

  const alreadyTaken = takenSeats(showtimeDoc, seats);
  if (alreadyTaken.length > 0) {
    throw new AppError(
      `Seats already booked: ${alreadyTaken.join(", ")}`,
      409
    );
  }

  const updatedShowtime = await reserveSeats(showtime, seats);

  if (!updatedShowtime) {
    throw new AppError(
      "One or more seats are already booked. Please try again.",
      409
    );
  }

  try {
    return await Booking.create({
      showtime,
      seats,
      user: user._id,
      customerName: user.name,
      customerEmail: user.email,
      status: "pending",
      holdExpiresAt: holdExpiry(),
      totalPrice: priceFor(showtimeDoc, seats),
    });
  } catch (err) {
    // Release the seats reserved above so a failed booking doesn't hold them
    await releaseSeats(showtime, seats);
    throw err;
  }
};

// The paid booking (with its showtime) and its captured payment, for this
// user, or a clear refusal
export const paidBookingFor = async (user, bookingId) => {
  const booking = await Booking.findOne({ _id: bookingId, ...accessFilter(user) }).populate("showtime");
  if (!booking) {
    throw new AppError("Booking not found", 404);
  }
  if (booking.status === "pending") {
    throw new AppError('This booking isn\'t paid; cancel it with { "status": "cancelled" }, nothing is charged', 409);
  }
  if (booking.status !== "confirmed") {
    throw new AppError(`A ${booking.status} booking can't be cancelled`, 409);
  }
  const payment = await Payment.findOne({ booking: booking._id, status: "captured" });
  if (!payment) {
    throw new AppError("No completed payment was found for this booking", 409);
  }
  return { booking, payment };
};

// What cancelling this paid booking refunds right now, from the policy
export const cancellationQuoteFor = (booking, payment) => ({
  ...quoteCancellation({ startTime: booking.showtime.startTime, paidCents: payment.amountCents }),
  paidCents: payment.amountCents,
  currency: payment.currency,
  showStartsAt: booking.showtime.startTime,
  policy: POLICY_TEXT,
});

// Cancels a paid booking and refunds what the policy allows at this moment
// (not what an earlier quote said). With expectedRefundCents (the amount the
// customer agreed to), a different refund is refused instead. The seats are
// freed only after PayPal accepted the refund.
export const cancelPaidBooking = async (user, bookingId, { expectedRefundCents } = {}) => {
  const { booking, payment } = await paidBookingFor(user, bookingId);
  const quote = cancellationQuoteFor(booking, payment);
  if (!quote.allowed) {
    throw new AppError(`This booking can't be cancelled any more: ${quote.reason.toLowerCase()}`, 409);
  }
  if (expectedRefundCents !== undefined && quote.refundCents !== expectedRefundCents) {
    throw new AppError(
      `The refund is now ${formatCents(quote.refundCents)} instead of ${formatCents(expectedRefundCents)} ` +
        `(${quote.refundPercent}% under the policy). Nothing was cancelled.`,
      409
    );
  }

  const refunded = await refundPayment(payment, {
    fromStatus: "captured",
    refundCents: quote.refundCents === payment.amountCents ? undefined : quote.refundCents,
  });

  const cancelled = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "confirmed" },
    { status: "refunded" },
    { returnDocument: "after" }
  );
  if (cancelled) {
    await releaseSeats(booking.showtime._id, booking.seats);
  }

  return { booking: cancelled ?? booking, payment: refunded, quote };
};
