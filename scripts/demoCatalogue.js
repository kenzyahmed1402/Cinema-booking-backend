import { localParts, zonedTime } from "../utils/timezone.js";

// A fictional catalogue for demos and local development. All names,
// addresses and plots are made up.

export const DEMO_CINEMAS = [
  {
    name: "Seatora Downtown",
    location: "Downtown, 12 Central Avenue",
    basePrice: 11,
    screens: [
      { screenNumber: 1, rows: 8, seatsPerRow: 12 },
      { screenNumber: 2, rows: 6, seatsPerRow: 10 },
    ],
  },
  {
    name: "Seatora Riverside",
    location: "Riverside, 48 Harbour Road",
    basePrice: 8,
    screens: [
      { screenNumber: 1, rows: 10, seatsPerRow: 14 },
      { screenNumber: 2, rows: 5, seatsPerRow: 8 },
    ],
  },
  {
    name: "Seatora Uptown",
    location: "Uptown, 7 Hilltop Square",
    basePrice: 13,
    screens: [
      { screenNumber: 1, rows: 8, seatsPerRow: 10 },
      { screenNumber: 2, rows: 7, seatsPerRow: 12 },
    ],
  },
];

export const DEMO_MOVIES = [
  {
    title: "Orbit of Ashes",
    genre: "Sci-Fi",
    duration: 128,
    description: "A salvage crew finds a silent colony ship circling a dying star, and someone on board is still awake.",
  },
  {
    title: "The Last Lighthouse Keeper",
    genre: "Drama",
    duration: 112,
    description: "On a storm-battered island, an old keeper trains the teenager sent to replace him.",
  },
  {
    title: "Midnight at Marrow Street",
    genre: "Thriller",
    duration: 104,
    description: "A night-shift pharmacist notices the same prescription filled by three different people.",
  },
  {
    title: "The Crumb Conspiracy",
    genre: "Comedy",
    duration: 96,
    description: "Two rival bakers team up when a mysterious critic threatens to close every shop on their street.",
  },
  {
    title: "Echoes Under Ice",
    genre: "Horror",
    duration: 99,
    description: "A research team drilling into a frozen lake starts hearing their own voices from below.",
  },
  {
    title: "Starlit Garden",
    genre: "Animation",
    duration: 92,
    description: "A shy firefly sets out to relight the lanterns of a garden that only blooms at night.",
  },
  {
    title: "Velocity Run",
    genre: "Action",
    duration: 118,
    description: "A courier has ninety minutes to cross a city in lockdown with a package everyone wants.",
  },
  {
    title: "Letters to Lisbon",
    genre: "Romance",
    duration: 107,
    description: "A translator falls for the voice in a stack of unsent letters she was hired to restore.",
  },
];

export const DEMO_DAYS = 7;

// Local time window for showings: first start at 13:00, last start by 22:30
const FIRST_START_MINUTES = 13 * 60;
const LAST_START_MINUTES = 22 * 60 + 30;
// Same changeover break the API enforces between showings on one screen
const BREAK_MINUTES = 15;
// Showings starting at or after 17:00 cost more
const EVENING_MINUTES = 17 * 60;
const EVENING_SURCHARGE = 3;

const roundUpToQuarter = (minutes) => Math.ceil(minutes / 15) * 15;

// Plans showtimes for today and the following days in `timeZone`. Each
// screen runs back-to-back showings with a break in between, rotating
// through the movies so every movie plays every day. Showings that already
// started are skipped. Returns { cinemaIndex, screenIndex, movieIndex,
// startTime, price } entries.
export const planShowtimes = ({ now = new Date(), timeZone, days = DEMO_DAYS }) => {
  const today = localParts(now, timeZone);
  const showtimes = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    DEMO_CINEMAS.forEach((cinema, cinemaIndex) => {
      cinema.screens.forEach((screen, screenIndex) => {
        let movieIndex = (cinemaIndex * 3 + screenIndex * 5 + dayOffset) % DEMO_MOVIES.length;
        let start = FIRST_START_MINUTES;

        while (start <= LAST_START_MINUTES) {
          const movie = DEMO_MOVIES[movieIndex];
          const startTime = zonedTime(
            {
              year: today.year,
              month: today.month,
              day: today.day + dayOffset,
              hour: Math.floor(start / 60),
              minute: start % 60,
            },
            timeZone
          );

          if (startTime > now) {
            showtimes.push({
              cinemaIndex,
              screenIndex,
              movieIndex,
              startTime,
              price: cinema.basePrice + (start >= EVENING_MINUTES ? EVENING_SURCHARGE : 0),
            });
          }

          start = roundUpToQuarter(start + movie.duration + BREAK_MINUTES);
          movieIndex = (movieIndex + 1) % DEMO_MOVIES.length;
        }
      });
    });
  }

  return showtimes;
};
