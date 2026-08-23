import Booking from "../models/Booking.js";
import Showtime from "../models/showTime.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";

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

  const updatedShowtime = await Showtime.findOneAndUpdate(
    { _id: showtime, bookedSeats: { $nin: seats } },
    { $addToSet: { bookedSeats: { $each: seats } } },
    { new: true }
  );

  if (!updatedShowtime) {
    throw new AppError(
      "One or more seats are already booked. Please try again.",
      409
    );
  }

  const booking = await Booking.create(req.body);

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
  const booking = await Booking.findOneAndUpdate(
    { _id: req.params.id },
    req.body,
    { new: true, runValidators: true }
  );

  if (!booking) {
    throw new AppError("Booking not found", 404);
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

  await Showtime.findOneAndUpdate(
    { _id: booking.showtime },
    { $pull: { bookedSeats: { $in: booking.seats } } }
  );

  res.status(204).json({
    status: "success",
    data: null,
  });
});
