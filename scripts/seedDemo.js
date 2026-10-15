// Fills an empty database with the fictional demo catalogue: cinemas,
// screens, movies and a week of showtimes.
//
//   npm run seed:demo            adds the catalogue if there is none yet
//   npm run seed:demo -- --reset replaces the catalogue (not in production)
//
// Users and bookings are never touched; --reset refuses while bookings exist.
import "dotenv/config";
import mongoose from "mongoose";
import Cinema from "../models/cinema.js";
import Screen from "../models/screens.js";
import Movie from "../models/movies.js";
import Showtime from "../models/showTime.js";
import Booking from "../models/Booking.js";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "../utils/timezone.js";
import { DEMO_CINEMAS, DEMO_MOVIES, planShowtimes } from "./demoCatalogue.js";

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const reset = process.argv.includes("--reset");
const timeZone = process.env.CINEMA_TZ || DEFAULT_TIME_ZONE;

if (!process.env.MONGO_URI) {
  fail("MONGO_URI must be set in .env.");
}
if (!isValidTimeZone(timeZone)) {
  fail(`CINEMA_TZ is not a valid time zone: ${timeZone}`);
}
if (reset && process.env.NODE_ENV === "production") {
  fail("--reset is disabled when NODE_ENV=production.");
}

const catalogue = [Showtime, Screen, Movie, Cinema];

const seedDemo = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const existing = await Cinema.countDocuments();
  if (existing > 0 && !reset) {
    console.log("The catalogue already has data; nothing was added. Use --reset to replace it.");
    return;
  }

  if (reset) {
    const bookings = await Booking.countDocuments();
    if (bookings > 0) {
      fail(`--reset refused: ${bookings} booking(s) exist and would lose their showtimes.`);
    }
    for (const model of catalogue) {
      await model.deleteMany({});
    }
  }

  const cinemas = await Cinema.insertMany(
    DEMO_CINEMAS.map(({ name, location }) => ({ name, location }))
  );

  const screens = await Screen.insertMany(
    DEMO_CINEMAS.flatMap((cinema, cinemaIndex) =>
      cinema.screens.map((screen) => ({
        ...screen,
        capacity: screen.rows * screen.seatsPerRow,
        cinema: cinemas[cinemaIndex]._id,
      }))
    )
  );
  const screenId = (cinemaIndex, screenIndex) =>
    screens.find(
      (screen) =>
        screen.cinema.equals(cinemas[cinemaIndex]._id) &&
        screen.screenNumber === DEMO_CINEMAS[cinemaIndex].screens[screenIndex].screenNumber
    )._id;

  const movies = await Movie.insertMany(DEMO_MOVIES);

  const showtimes = await Showtime.insertMany(
    planShowtimes({ timeZone }).map(({ cinemaIndex, screenIndex, movieIndex, startTime, price }) => ({
      screen: screenId(cinemaIndex, screenIndex),
      movie: movies[movieIndex]._id,
      startTime,
      price,
    }))
  );

  console.log(
    `Demo catalogue added: ${cinemas.length} cinemas, ${screens.length} screens, ` +
      `${movies.length} movies, ${showtimes.length} showtimes (times in ${timeZone}).`
  );
};

try {
  await seedDemo();
  await mongoose.disconnect();
} catch (error) {
  // Only the message: a full error could include the connection string
  fail(`Failed to seed the demo catalogue: ${error.message}`);
}
