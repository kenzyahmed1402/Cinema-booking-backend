import Booking, {
  API_STATUS_CHANGES,
  BOOKING_STATUSES,
  PAID_STATUSES,
  holdsSeats,
} from "../models/Booking.js";
import Showtime from "../models/showTime.js";
import Payment from "../models/Payment.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { buildFilter, enumFilter, getPagination, idFilter, sendPage } from "../utils/listQuery.js";
import { assertSeatsFit } from "../utils/seatLayout.js";
import { releaseSeats, reserveSeats } from "../utils/showtimeSeats.js";
import {
  accessFilter,
  cancelPaidBooking as cancelPaid,
  cancellationQuoteFor,
  holdSeats,
  paidBookingFor,
  priceFor,
  quoteSeats,
} from "../services/bookingService.js";

// A booking holds its seats on its showtime unless it is cancelled, expired
// or refunded
const heldSeats = ({ showtime, seats, status }) => ({
  showtime: String(showtime),
  seats: holdsSeats(status) ? seats : [],
});

const sameSeats = (a, b) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

// Refuses (409) changes the booking's current state doesn't allow. Only an
// unpaid (pending) booking can be cancelled or get other seats or another
// showtime; a paid booking's seats and price are fixed. Sending the status it
// already has changes nothing.
const assertAllowedChange = (existing, changes) => {
  if (changes.status && changes.status !== existing.status) {
    const allowed = API_STATUS_CHANGES[existing.status] ?? [];
    if (!allowed.includes(changes.status)) {
      throw new AppError(
        `A ${existing.status} booking can't be changed to ${changes.status}` +
          (PAID_STATUSES.includes(existing.status) ? "; paid bookings are cancelled with a refund" : ""),
        409
      );
    }
  }

  if ((changes.seats || changes.showtime) && existing.status !== "pending") {
    throw new AppError(
      `The seats and showtime of a ${existing.status} booking can't be changed`,
      409
    );
  }
};

// POST /bookings/quote { showtime, seats }: what these seats would cost,
// calculated by the server, without reserving anything
export const quoteBooking = catchAsync(async (req, res) => {
  const quote = await quoteSeats(req.body);
  res.json({ status: "success", data: { quote } });
});

export const createBooking = catchAsync(async (req, res) => {
  const booking = await holdSeats(req.user, req.body);
  res.status(201).json({
    status: "success",
    data: { booking },
  });
});

// Filters: ?showtime=<id>&status=confirmed. Newest first.
export const getBookings = catchAsync(async (req, res) => {
  const pagination = getPagination(req.query);
  const filter = {
    ...accessFilter(req.user),
    ...buildFilter({
      showtime: idFilter(req.query, "showtime"),
      status: enumFilter(req.query, "status", BOOKING_STATUSES),
    }),
  };
  const query = Booking.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .populate({
      path: "showtime",
      populate: [{ path: "movie" }, { path: "screen", populate: { path: "cinema" } }],
    });

  await sendPage(res, "bookings", query, await Booking.countDocuments(filter), pagination);
});

export const getBookingById = catchAsync(async (req, res) => {
  const booking = await Booking.findOne({
    _id: req.params.id,
    ...accessFilter(req.user),
  }).populate({
    path: "showtime",
    populate: [{ path: "movie" }, { path: "screen", populate: { path: "cinema" } }],
  });

  if (!booking) {
    throw new AppError("Booking not found", 404);
  }

  res.json({
    status: "success",
    data: { booking },
  });
});

export const updateBooking = catchAsync(async (req, res) => {
  const existing = await Booking.findOne({
    _id: req.params.id,
    ...accessFilter(req.user),
  });

  if (!existing) {
    throw new AppError("Booking not found", 404);
  }

  // Only validated fields; totalPrice isn't one of them, it's calculated below
  const changes = req.body;
  assertAllowedChange(existing, changes);

  // Once checkout has started, the price the customer saw must not change
  if ((changes.seats || changes.showtime) && (await Payment.exists({ booking: existing._id }))) {
    throw new AppError("The seats and showtime can't be changed once payment has started", 409);
  }

  const before = heldSeats(existing);
  const after = heldSeats({ ...existing.toObject(), ...changes });
  const sameShowtime = before.showtime === after.showtime;
  const newSeats = changes.seats ?? existing.seats;

  const toReserve = sameShowtime
    ? after.seats.filter((seat) => !before.seats.includes(seat))
    : after.seats;
  const toRelease = sameShowtime
    ? before.seats.filter((seat) => !after.seats.includes(seat))
    : before.seats;

  const seatsOrShowtimeChanged = !sameShowtime || !sameSeats(existing.seats, newSeats);

  let newTotalPrice = existing.totalPrice;
  if (seatsOrShowtimeChanged || toReserve.length > 0) {
    const showtimeDoc = await Showtime.findById(after.showtime).populate("screen");
    if (!showtimeDoc) {
      throw new AppError("Showtime not found", 404);
    }

    if (toReserve.length > 0) {
      assertSeatsFit(showtimeDoc.screen, toReserve, {
        // seats this booking gives back on the same showtime free up room
        alreadyBooked: showtimeDoc.bookedSeats.length - (sameShowtime ? toRelease.length : 0),
      });
    }

    // Reprice only when the seats or showtime change; editing name, email or
    // status keeps the price that was charged
    if (seatsOrShowtimeChanged) {
      newTotalPrice = priceFor(showtimeDoc, newSeats);
    }
  }

  // Reserve first: if the new seats are taken, nothing has changed yet
  if (toReserve.length > 0 && !(await reserveSeats(after.showtime, toReserve))) {
    throw new AppError(
      `One or more seats are already booked: ${toReserve.join(", ")}`,
      409
    );
  }

  let booking;
  try {
    // Only if the status is still the one checked above: a payment or an
    // expiring hold may have changed it in the meantime
    booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, status: existing.status },
      { ...changes, totalPrice: newTotalPrice },
      { returnDocument: "after", runValidators: true }
    );

    if (!booking) {
      throw new AppError("The booking changed while it was being updated. Please try again.", 409);
    }
  } catch (err) {
    // Undo the reservation so a failed update doesn't hold the new seats
    if (toReserve.length > 0) {
      await releaseSeats(after.showtime, toReserve);
    }
    throw err;
  }

  if (toRelease.length > 0) {
    await releaseSeats(before.showtime, toRelease);
  }

  res.json({
    status: "success",
    data: { booking },
  });
});

export const deleteBooking = catchAsync(async (req, res) => {
  // A paid booking is the record of a payment, so it is never deleted. The
  // status check is part of the delete, so it can't change in between.
  const booking = await Booking.findOneAndDelete({
    _id: req.params.id,
    status: { $nin: PAID_STATUSES },
  });

  if (!booking) {
    const paid = await Booking.findById(req.params.id).select("status");
    if (paid) {
      throw new AppError(`A ${paid.status} booking can't be deleted: it has a payment`, 409);
    }
    throw new AppError("Booking not found", 404);
  }

  // A cancelled, expired or refunded booking already gave its seats back;
  // releasing them again could free seats that another booking now holds
  const { showtime, seats } = heldSeats(booking);
  if (seats.length > 0) {
    await releaseSeats(showtime, seats);
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
});

// GET /bookings/:id/cancellation-quote: what cancelling this paid booking
// refunds right now, calculated by the server from the policy
export const getCancellationQuote = catchAsync(async (req, res) => {
  const { booking, payment } = await paidBookingFor(req.user, req.params.id);
  res.json({ status: "success", data: { quote: cancellationQuoteFor(booking, payment) } });
});

// POST /bookings/:id/cancel { confirm: true, expectedRefundCents? }: cancels
// a paid booking and refunds what the policy allows at this moment (not what
// an earlier quote said). With expectedRefundCents, the refund the customer
// was shown, a different refund is refused and nothing is cancelled. The
// seats are freed only after PayPal accepted the refund.
export const cancelPaidBooking = catchAsync(async (req, res) => {
  const result = await cancelPaid(req.user, req.params.id, { expectedRefundCents: req.body.expectedRefundCents });
  res.json({ status: "success", data: result });
});
