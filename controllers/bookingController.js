import Booking, { MAX_SEATS } from "../models/Booking.js";
import Showtime from "../models/showTime.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { buildFilter, enumFilter, getPagination, idFilter, sendPage } from "../utils/listQuery.js";
import { assertSeatsFit } from "../utils/seatLayout.js";

// A booking holds its seats on its showtime unless it is cancelled
const heldSeats = ({ showtime, seats, status }) => ({
  showtime: String(showtime),
  seats: status === "cancelled" ? [] : seats,
});

// Atomically adds the seats to the showtime only if none of them are taken.
// Resolves to null if the showtime doesn't exist or a seat is already booked.
const reserveSeats = (showtime, seats) =>
  Showtime.findOneAndUpdate(
    { _id: showtime, bookedSeats: { $nin: seats } },
    { $addToSet: { bookedSeats: { $each: seats } } },
    { returnDocument: "after" }
  );

const releaseSeats = (showtime, seats) =>
  Showtime.updateOne(
    { _id: showtime },
    { $pull: { bookedSeats: { $in: seats } } }
  );

// The server always calculates the price; rounded to cents to avoid
// floating point leftovers like 0.30000000000000004
const priceFor = (showtimeDoc, seats) =>
  Math.round(showtimeDoc.price * seats.length * 100) / 100;

const sameSeats = (a, b) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

// Customers can only reach their own bookings; admins can reach all of them.
// Someone else's booking looks "not found" so its ID isn't confirmed.
const accessFilter = (req) =>
  req.user.role === "ADMIN" ? {} : { user: req.user._id };

export const createBooking = catchAsync(async (req, res) => {
  const { showtime, seats } = req.body;

  const showtimeDoc = await Showtime.findById(showtime).populate("screen");
  if (!showtimeDoc) {
    throw new AppError("Showtime not found", 404);
  }

  assertSeatsFit(showtimeDoc.screen, seats, {
    alreadyBooked: showtimeDoc.bookedSeats.length,
  });

  // Customers can hold at most MAX_SEATS active seats per showtime, across
  // all their bookings. Admins are exempt, e.g. for group bookings.
  if (req.user.role !== "ADMIN") {
    const mine = await Booking.find({
      user: req.user._id,
      showtime,
      status: { $ne: "cancelled" },
    });
    const held = mine.reduce((count, booking) => count + booking.seats.length, 0);
    if (held + seats.length > MAX_SEATS) {
      throw new AppError(
        `You can book at most ${MAX_SEATS} seats per showtime (you already have ${held})`,
        409
      );
    }
  }

  const alreadyTaken = seats.filter((seat) =>
    showtimeDoc.bookedSeats.includes(seat)
  );
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
    // New bookings always start as pending; only an admin changes the status
    booking = await Booking.create({
      ...req.body,
      user: req.user._id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      status: "pending",
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
      status: enumFilter(req.query, "status", ["pending", "confirmed", "cancelled"]),
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
    booking = await Booking.findOneAndUpdate(
      { _id: req.params.id },
      { ...changes, totalPrice: newTotalPrice },
      { returnDocument: "after", runValidators: true }
    );

    if (!booking) {
      throw new AppError("Booking not found", 404);
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
  const booking = await Booking.findOneAndDelete({ _id: req.params.id });

  if (!booking) {
    throw new AppError("Booking not found", 404);
  }

  // A cancelled booking already gave its seats back; releasing them again
  // could free seats that another booking now holds
  const { showtime, seats } = heldSeats(booking);
  if (seats.length > 0) {
    await releaseSeats(showtime, seats);
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
});
