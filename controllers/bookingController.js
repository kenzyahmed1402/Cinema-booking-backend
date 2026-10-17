import Booking, {
  API_STATUS_CHANGES,
  BOOKING_STATUSES,
  MAX_SEATS,
  PAID_STATUSES,
  SEAT_HOLDING_STATUSES,
  holdsSeats,
} from "../models/Booking.js";
import Showtime from "../models/showTime.js";
import Payment from "../models/Payment.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { buildFilter, enumFilter, getPagination, idFilter, sendPage } from "../utils/listQuery.js";
import { assertSeatsFit } from "../utils/seatLayout.js";
import { releaseSeats, reserveSeats } from "../utils/showtimeSeats.js";
import { holdExpiry } from "../utils/bookingHolds.js";
import { POLICY_TEXT, quoteCancellation } from "../utils/cancellationPolicy.js";
import { refundPayment } from "../services/refundService.js";

// A booking holds its seats on its showtime unless it is cancelled, expired
// or refunded
const heldSeats = ({ showtime, seats, status }) => ({
  showtime: String(showtime),
  seats: holdsSeats(status) ? seats : [],
});

// The server always calculates the price; rounded to cents to avoid
// floating point leftovers like 0.30000000000000004
const priceFor = (showtimeDoc, seats) =>
  Math.round(showtimeDoc.price * seats.length * 100) / 100;

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

// Customers can only reach their own bookings; admins can reach all of them.
// Someone else's booking looks "not found" so its ID isn't confirmed.
const accessFilter = (req) =>
  req.user.role === "ADMIN" ? {} : { user: req.user._id };

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

// POST /bookings/quote { showtime, seats }: what these seats would cost,
// calculated by the server, without reserving anything
export const quoteBooking = catchAsync(async (req, res) => {
  const { showtime, seats } = req.body;
  const showtimeDoc = await bookableShowtime(showtime);
  assertSeatsFit(showtimeDoc.screen, seats, { alreadyBooked: showtimeDoc.bookedSeats.length });

  const taken = takenSeats(showtimeDoc, seats);
  if (taken.length > 0) {
    throw new AppError(`Seats already booked: ${taken.join(", ")}`, 409);
  }

  res.json({
    status: "success",
    data: {
      quote: {
        showtime: showtimeDoc._id,
        startTime: showtimeDoc.startTime,
        seats,
        pricePerSeat: showtimeDoc.price,
        totalPrice: priceFor(showtimeDoc, seats),
        totalCents: Math.round(priceFor(showtimeDoc, seats) * 100),
        currency: "USD",
      },
    },
  });
});

export const createBooking = catchAsync(async (req, res) => {
  const { showtime, seats } = req.body;

  const showtimeDoc = await bookableShowtime(showtime);

  assertSeatsFit(showtimeDoc.screen, seats, {
    alreadyBooked: showtimeDoc.bookedSeats.length,
  });

  // Customers can hold at most MAX_SEATS active seats per showtime, across
  // all their bookings. Admins are exempt, e.g. for group bookings.
  if (req.user.role !== "ADMIN") {
    const mine = await Booking.find({
      user: req.user._id,
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

  let booking;
  try {
    // New bookings always start as pending and hold their seats until
    // holdExpiresAt; unpaid by then, they expire and the seats come back
    booking = await Booking.create({
      ...req.body,
      user: req.user._id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      status: "pending",
      holdExpiresAt: holdExpiry(),
      totalPrice: priceFor(showtimeDoc, seats),
    });
  } catch (err) {
    // Release the seats reserved above so a failed booking doesn't hold them
    await releaseSeats(showtime, seats);
    throw err;
  }

  res.status(201).json({
    status: "success",
    data: { booking },
  });
});

// Filters: ?showtime=<id>&status=confirmed. Newest first.
export const getBookings = catchAsync(async (req, res) => {
  const pagination = getPagination(req.query);
  const filter = {
    ...accessFilter(req),
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
      populate: [{ path: "movie" }, { path: "screen" }],
    });

  await sendPage(res, "bookings", query, await Booking.countDocuments(filter), pagination);
});

export const getBookingById = catchAsync(async (req, res) => {
  const booking = await Booking.findOne({
    _id: req.params.id,
    ...accessFilter(req),
  }).populate({
    path: "showtime",
    populate: [{ path: "movie" }, { path: "screen" }],
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
    ...accessFilter(req),
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

// The paid booking (with its showtime) and its captured payment, for the
// logged-in user, or a clear refusal
const paidBookingFor = async (req) => {
  const booking = await Booking.findOne({ _id: req.params.id, ...accessFilter(req) }).populate("showtime");
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

const quoteFor = (booking, payment) => ({
  ...quoteCancellation({ startTime: booking.showtime.startTime, paidCents: payment.amountCents }),
  paidCents: payment.amountCents,
  currency: payment.currency,
  showStartsAt: booking.showtime.startTime,
  policy: POLICY_TEXT,
});

// GET /bookings/:id/cancellation-quote: what cancelling this paid booking
// refunds right now, calculated by the server from the policy
export const getCancellationQuote = catchAsync(async (req, res) => {
  const { booking, payment } = await paidBookingFor(req);
  res.json({ status: "success", data: { quote: quoteFor(booking, payment) } });
});

// POST /bookings/:id/cancel { confirm: true }: cancels a paid booking and
// refunds what the policy allows at this moment (not what an earlier quote
// said). The seats are freed only after PayPal accepted the refund.
export const cancelPaidBooking = catchAsync(async (req, res) => {
  const { booking, payment } = await paidBookingFor(req);
  const quote = quoteFor(booking, payment);
  if (!quote.allowed) {
    throw new AppError(`This booking can't be cancelled any more: ${quote.reason.toLowerCase()}`, 409);
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

  res.json({ status: "success", data: { booking: cancelled ?? booking, payment: refunded, quote } });
});
