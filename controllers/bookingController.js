import Booking from "../models/Booking.js";
import Showtime from "../models/showTime.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";

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
    { new: true }
  );

const releaseSeats = (showtime, seats) =>
  Showtime.updateOne(
    { _id: showtime },
    { $pull: { bookedSeats: { $in: seats } } }
  );

export const createBooking = catchAsync(async (req, res) => {
  const { showtime, seats } = req.body;

  const showtimeDoc = await Showtime.findById(showtime);
  if (!showtimeDoc) {
    throw new AppError("Showtime not found", 404);
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
    booking = await Booking.create({ ...req.body, status: "pending" });
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

export const getBookings = catchAsync(async (req, res) => {
  const bookings = await Booking.find().populate({
    path: "showtime",
    populate: [{ path: "movie" }, { path: "screen" }],
  });

  res.json({
    status: "success",
    results: bookings.length,
    data: { bookings },
  });
});

export const getBookingById = catchAsync(async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate({
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
  const existing = await Booking.findById(req.params.id);

  if (!existing) {
    throw new AppError("Booking not found", 404);
  }

  const before = heldSeats(existing);
  const after = heldSeats({ ...existing.toObject(), ...req.body });
  const sameShowtime = before.showtime === after.showtime;

  if (!sameShowtime && !(await Showtime.exists({ _id: after.showtime }))) {
    throw new AppError("Showtime not found", 404);
  }

  const toReserve = sameShowtime
    ? after.seats.filter((seat) => !before.seats.includes(seat))
    : after.seats;
  const toRelease = sameShowtime
    ? before.seats.filter((seat) => !after.seats.includes(seat))
    : before.seats;

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
      req.body,
      { new: true, runValidators: true }
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
