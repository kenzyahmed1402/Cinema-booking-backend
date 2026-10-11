import Showtime from "../models/showTime.js";
import Movie, { MAX_MOVIE_MINUTES } from "../models/movies.js";
import Screen from "../models/screens.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { buildFilter, dayFilter, getPagination, idFilter, sendPage } from "../utils/listQuery.js";
import { deleteShowtimesWhere } from "../utils/cascade.js";
import { assertSeatsFit } from "../utils/seatLayout.js";

// Minutes kept free after every showing for cleaning and changeover
const BREAK_MINUTES = 15;
const MINUTE = 60 * 1000;

// A showing occupies its screen from startTime until the movie and the
// break after it are over
const busyUntil = (startTime, duration) =>
  new Date(new Date(startTime).getTime() + (duration + BREAK_MINUTES) * MINUTE);

// Throws 409 if another showing on the screen overlaps this one. Looks back
// far enough to catch the longest possible movie that's still running.
const assertScreenFree = async ({ screen, startTime, duration, ignoreId }) => {
  const start = new Date(startTime);
  const end = busyUntil(start, duration);

  const filter = {
    screen,
    startTime: {
      $gt: new Date(start.getTime() - (MAX_MOVIE_MINUTES + BREAK_MINUTES) * MINUTE),
      $lt: end,
    },
  };
  if (ignoreId) {
    filter._id = { $ne: ignoreId };
  }

  const nearby = await Showtime.find(filter).populate("movie", "title duration");
  const clash = nearby.find(
    (other) => busyUntil(other.startTime, other.movie?.duration ?? 0) > start
  );

  if (clash) {
    throw new AppError(
      `Screen is busy: "${clash.movie?.title ?? "another showing"}" runs from ` +
        `${new Date(clash.startTime).toISOString()} until ` +
        `${busyUntil(clash.startTime, clash.movie?.duration ?? 0).toISOString()} ` +
        `(including a ${BREAK_MINUTES}-minute break)`,
      409
    );
  }
};

export const createShowtime = catchAsync(async (req, res) => {
  const { movie, screen, startTime } = req.body;

  const movieExists = await Movie.findById(movie);
  if (!movieExists) {
    throw new AppError("Movie not found", 404);
  }

  const screenExists = await Screen.findById(screen);
  if (!screenExists) {
    throw new AppError("Screen not found", 404);
  }

  await assertScreenFree({ screen, startTime, duration: movieExists.duration });

  const showtime = await Showtime.create(req.body);
  res.status(201).json({
    status: "success",
    data: { showtime },
  });
});

// Filters: ?movie=<id>&screen=<id>&date=2030-03-01 (a UTC day)
export const getShowtimes = catchAsync(async (req, res) => {
  const pagination = getPagination(req.query);
  const filter = buildFilter({
    movie: idFilter(req.query, "movie"),
    screen: idFilter(req.query, "screen"),
    startTime: dayFilter(req.query, "date"),
  });
  const query = Showtime.find(filter)
    .sort({ startTime: 1, _id: 1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .populate("movie")
    .populate("screen");

  await sendPage(res, "showtimes", query, await Showtime.countDocuments(filter), pagination);
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
  const existing = await Showtime.findById(req.params.id);
  if (!existing) {
    throw new AppError("Showtime not found", 404);
  }

  let movieDoc;
  if (req.body.movie) {
    movieDoc = await Movie.findById(req.body.movie);
    if (!movieDoc) {
      throw new AppError("Movie not found", 404);
    }
  }

  if (req.body.screen) {
    const newScreen = await Screen.findById(req.body.screen);
    if (!newScreen) {
      throw new AppError("Screen not found", 404);
    }

    // Seats already booked must exist on (and fit) the new screen
    if (existing.bookedSeats.length > 0) {
      try {
        assertSeatsFit(newScreen, existing.bookedSeats, { alreadyBooked: 0 });
      } catch (err) {
        throw new AppError(`Can't move this showtime to that screen. ${err.message}`, 409);
      }
    }
  }

  // A new time, screen or movie (length) can make it overlap another showing
  if (req.body.startTime || req.body.screen || req.body.movie) {
    movieDoc ??= await Movie.findById(existing.movie);
    await assertScreenFree({
      screen: req.body.screen ?? existing.screen,
      startTime: req.body.startTime ?? existing.startTime,
      duration: movieDoc?.duration ?? 0,
      ignoreId: existing._id,
    });
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
  const showtime = await Showtime.findById(req.params.id);
  if (!showtime) {
    throw new AppError("Showtime not found", 404);
  }

  // Blocked while it has active bookings; cancelled ones go with it
  await deleteShowtimesWhere({ _id: showtime._id }, "this showtime");

  res.status(204).json({
    status: "success",
    data: null,
  });
});
