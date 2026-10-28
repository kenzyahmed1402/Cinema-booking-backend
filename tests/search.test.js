import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, book, createUser, useTestDatabase } from "./helpers.js";
import Cinema from "../models/cinema.js";
import Screen from "../models/screens.js";
import Movie from "../models/movies.js";
import Showtime from "../models/showTime.js";

useTestDatabase();

const HOUR = 60 * 60 * 1000;
const inHours = (hours) => new Date(Date.now() + hours * HOUR);

// Two cinemas in different areas, a sci-fi and a comedy, and showtimes from
// one that has already started to ones later today and tomorrow
const catalogue = async () => {
  const [downtown, riverside] = await Cinema.create([
    { name: "CineMate Downtown", location: "Downtown, 12 Central Avenue" },
    { name: "CineMate Riverside", location: "Riverside, 48 Harbour Road" },
  ]);
  const [downScreen, riverScreen] = await Screen.create([
    { cinema: downtown._id, screenNumber: 1, rows: 5, seatsPerRow: 10, capacity: 50 },
    { cinema: riverside._id, screenNumber: 1, rows: 5, seatsPerRow: 10, capacity: 50 },
  ]);
  const [scifi, comedy] = await Movie.create([
    { title: "Orbit of Ashes", genre: "Sci-Fi", duration: 120 },
    { title: "The Crumb Conspiracy", genre: "Comedy", duration: 90 },
  ]);
  const [started, tonight, tomorrow, riverTonight] = await Showtime.create([
    { movie: scifi._id, screen: downScreen._id, startTime: inHours(-1), price: 12 },
    { movie: scifi._id, screen: downScreen._id, startTime: inHours(5), price: 13 },
    { movie: comedy._id, screen: downScreen._id, startTime: inHours(29), price: 11 },
    { movie: scifi._id, screen: riverScreen._id, startTime: inHours(5), price: 9 },
  ]);
  return { downtown, started, tonight, tomorrow, riverTonight };
};

const ids = (res) => res.body.data.showtimes.map((s) => s._id);

describe("searching showtimes", () => {
  it("filters by area, cinema, genre, time window and upcoming, with the cinema included", async () => {
    const c = await catalogue();

    const downtownSciFi = await api.get("/showTimes?area=downtown&genre=Sci-Fi&upcoming=true");
    assert.equal(downtownSciFi.status, 200);
    assert.deepEqual(ids(downtownSciFi), [String(c.tonight._id)]);
    const [first] = downtownSciFi.body.data.showtimes;
    assert.equal(first.screen.cinema.name, "CineMate Downtown");
    assert.equal(first.movie.title, "Orbit of Ashes");
    assert.equal(first.availableSeats, 50);

    const one = await api.get(`/showTimes/${c.tonight._id}`);
    assert.equal(one.body.data.showtime.screen.cinema.name, "CineMate Downtown");

    assert.equal(ids(await api.get(`/showTimes?cinema=${c.downtown._id}`)).length, 3);
    const window = await api.get(`/showTimes?from=${inHours(4).toISOString()}&to=${inHours(6).toISOString()}`);
    assert.deepEqual(ids(window).sort(), [String(c.tonight._id), String(c.riverTonight._id)].sort());
  });

  it("matches area text literally and rejects bad parameters", async () => {
    await catalogue();
    assert.equal(ids(await api.get("/showTimes?area=.*")).length, 0);
    for (const bad of ["genre=Opera", "from=yesterday", "upcoming=yes", `area=${"x".repeat(101)}`, "cinema=nope"]) {
      assert.equal((await api.get(`/showTimes?${bad}`)).status, 400, bad);
    }
  });

  it("shows a seat map with the taken seats", async () => {
    const c = await catalogue();
    const alice = await createUser();
    await book(alice, c.tonight, ["B2", "A1"]);

    const res = await api.get(`/showTimes/${c.tonight._id}/seats`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.seatMap, {
      showtime: String(c.tonight._id),
      startTime: c.tonight.startTime.toISOString(),
      price: 13,
      rows: 5,
      seatsPerRow: 10,
      capacity: 50,
      taken: ["A1", "B2"],
      available: 48,
    });
  });
});

describe("price quotes", () => {
  it("price the seats on the server without reserving them", async () => {
    const c = await catalogue();
    const alice = await createUser();
    const quote = (seats, showtime = c.tonight) =>
      api.post("/bookings/quote").set(alice.auth).send({ showtime: showtime._id, seats });

    const res = await quote(["A1", "A2"]);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.quote.totalPrice, 26);
    assert.equal(res.body.data.quote.totalCents, 2600);
    assert.deepEqual((await Showtime.findById(c.tonight._id)).bookedSeats, []);

    await book(alice, c.tonight, ["A1"]);
    assert.equal((await quote(["A1", "A2"])).status, 409);
    assert.equal((await quote(["Z1"])).status, 400);
  });

  it("a showtime that has already started can't be quoted or booked", async () => {
    const c = await catalogue();
    const alice = await createUser();
    const body = { showtime: c.started._id, seats: ["A1"] };
    assert.equal((await api.post("/bookings/quote").set(alice.auth).send(body)).status, 409);
    const booking = await api.post("/bookings").set(alice.auth).send(body);
    assert.equal(booking.status, 409);
    assert.match(booking.body.message, /already started/);
  });
});
