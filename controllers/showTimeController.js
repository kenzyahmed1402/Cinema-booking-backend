import Showtime from "../models/showTime.js";
import Movie, { MAX_MOVIE_MINUTES, allowedGenres } from "../models/movies.js";
import Cinema from "../models/cinema.js";
import Screen from "../models/screens.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import {
  booleanParam,
  dayFilter,
  enumFilter,
  getPagination,
  idFilter,
  sendPage,
  textParam,
  timeParam,
} from "../utils/listQuery.js";
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

// Filters, all optional and combined:
//   ?movie=<id>  ?screen=<id>  ?cinema=<id>
//   ?area=downtown   cinemas whose location contains the text
//   ?genre=Sci-Fi
//   ?date=2030-03-01 (a UTC day)  ?from=<date-time>  ?to=<date-time>
//   ?upcoming=true   only showtimes that haven't started
// Each showtime comes with its movie, screen and the screen's cinema.
export const getShowtimes = catchAsync(async (req, res) => {
  const pagination = getPagination(req.query);
  const q = req.query;
  const conditions = [];

  const movie = idFilter(q, "movie");
  if (movie) conditions.push({ movie });
  const screen = idFilter(q, "screen");
  if (screen) conditions.push({ screen });

  const genre = enumFilter(q, "genre", allowedGenres);
  if (genre) {
    conditions.push({ movie: { $in: await Movie.find({ genre }).distinct("_id") } });
  }

  const cinema = idFilter(q, "cinema");
  const area = textParam(q, "area");
  if (cinema || area) {
    const cinemaFilter = { ...(cinema && { _id: cinema }), ...(area && { location: area }) };
    const cinemaIds = await Cinema.find(cinemaFilter).distinct("_id");
    conditions.push({ screen: { $in: await Screen.find({ cinema: { $in: cinemaIds } }).distinct("_id") } });
  }

  const day = dayFilter(q, "date");
  if (day) conditions.push({ startTime: day });
  const from = timeParam(q, "from");
  if (from) conditions.push({ startTime: { $gte: from } });
  const to = timeParam(q, "to");
  if (to) conditions.push({ startTime: { $lt: to } });
  if (booleanParam(q, "upcoming")) conditions.push({ startTime: { $gt: new Date() } });

  const filter = conditions.length > 0 ? { $and: conditions } : {};
  const query = Showtime.find(filter)
    .sort({ startTime: 1, _id: 1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .populate("movie")
    .populate({ path: "screen", populate: { path: "cinema" } });

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

// GET /showTimes/:id/seats: the seat map for a seat picker. Seats are rows
// A.. and numbers 1..; `taken` lists the ones that are booked or held.
export const getSeatMap = catchAsync(async (req, res) => {
  const showtime = await Showtime.findById(req.params.id).populate("screen");
  if (!showtime) {
    throw new AppError("Showtime not found", 404);
  }
  const { screen } = showtime;
  res.json({
    status: "success",
    data: {
      seatMap: {
        showtime: showtime._id,
        startTime: showtime.startTime,
        price: showtime.price,
        rows: screen?.rows ?? null,
        seatsPerRow: screen?.seatsPerRow ?? null,
        capacity: screen?.capacity ?? 0,
        taken: [...showtime.bookedSeats].sort(),
        available: Math.max((screen?.capacity ?? 0) - showtime.bookedSeats.length, 0),
      },
    },
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
    { returnDocument: "after", runValidators: true }
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
