import Showtime from "../models/showTime.js";
import Movie, { allowedGenres } from "../models/movies.js";
import Cinema from "../models/cinema.js";
import Screen from "../models/screens.js";
import { booleanParam, dayFilter, enumFilter, idFilter, textParam, timeParam } from "../utils/listQuery.js";

// The showtime search shared by GET /showTimes and the assistant's tools.
// Filters, all optional and combined (values as in a query string):
//   movie, screen, cinema   IDs
//   area      cinemas whose location contains the text
//   genre     one of the movie genres
//   date      a UTC day like 2030-03-01;  from, to   date-times
//   upcoming  "true" for only showtimes that haven't started
// Invalid values are refused with 400.
export const showtimeFilter = async (q) => {
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

  return conditions.length > 0 ? { $and: conditions } : {};
};

// Showtimes matching a filter, soonest first, each with its movie, screen
// and the screen's cinema
export const findShowtimes = (filter, { skip = 0, limit }) =>
  Showtime.find(filter)
    .sort({ startTime: 1, _id: 1 })
    .skip(skip)
    .limit(limit)
    .populate("movie")
    .populate({ path: "screen", populate: { path: "cinema" } });
