import Showtime from "../models/showTime.js";
import Movie from "../models/movies.js";
import Screen from "../models/screens.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { assertSeatsFit } from "../utils/seatLayout.js";

export const createShowtime = catchAsync(async (req, res) => {
  const { movie, screen } = req.body;

  const movieExists = await Movie.findById(movie);
  if (!movieExists) {
    throw new AppError("Movie not found", 404);
  }

  const screenExists = await Screen.findById(screen);
  if (!screenExists) {
    throw new AppError("Screen not found", 404);
  }

  const showtime = await Showtime.create(req.body);
  res.status(201).json({
    status: "success",
    data: { showtime },
  });
});

export const getShowtimes = catchAsync(async (req, res) => {
  const showtimes = await Showtime.find()
    .populate("movie")
    .populate("screen");
  res.json({
    status: "success",
    results: showtimes.length,
    data: { showtimes },
  });
});

export const getShowtimeById = catchAsync(async (req, res) => {
  const showtime = await Showtime.findById(req.params.id)
    .populate("movie")
    .populate("screen");

  if (!showtime) {
    throw new AppError("Showtime not found", 404);
  }

  res.json({
    status: "success",
    data: { showtime },
  });
});

export const updateShowtime = catchAsync(async (req, res) => {
  if (req.body.movie) {
    const movieExists = await Movie.findById(req.body.movie);
    if (!movieExists) {
      throw new AppError("Movie not found", 404);
    }
  }

  if (req.body.screen) {
    const newScreen = await Screen.findById(req.body.screen);
    if (!newScreen) {
      throw new AppError("Screen not found", 404);
    }

    // Seats already booked must exist on (and fit) the new screen
    const existing = await Showtime.findById(req.params.id);
    if (existing && existing.bookedSeats.length > 0) {
      try {
        assertSeatsFit(newScreen, existing.bookedSeats, { alreadyBooked: 0 });
      } catch (err) {
        throw new AppError(`Can't move this showtime to that screen. ${err.message}`, 409);
      }
    }
  }

  const showtime = await Showtime.findOneAndUpdate(
    { _id: req.params.id },
    req.body,
    { new: true, runValidators: true }
  )
    .populate("movie")
    .populate("screen");

  if (!showtime) {
    throw new AppError("Showtime not found", 404);
  }

  res.json({
    status: "success",
    data: { showtime },
  });
});

export const deleteShowtime = catchAsync(async (req, res) => {
  const showtime = await Showtime.findOneAndDelete({ _id: req.params.id });

  if (!showtime) {
    throw new AppError("Showtime not found", 404);
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
});
