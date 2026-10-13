import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Movie from "../models/movies.js";
import { api, book, created, createShowtime, createUser, useTestDatabase } from "./helpers.js";

useTestDatabase();

const genres = ["Drama", "Comedy", "Action"];
const addMovies = (count) =>
  Movie.insertMany(
    Array.from({ length: count }, (_, i) => ({
      title: `Movie ${String(i).padStart(2, "0")}`,
      genre: genres[i % 3],
      duration: 90,
    }))
  );

describe("pagination", () => {
  it("returns 20 per page by default with page info", async () => {
    await addMovies(25);
    const first = await api.get("/movies");
    assert.equal(first.body.results, 20);
    assert.deepEqual(first.body.pagination, { page: 1, limit: 20, total: 25, pages: 2 });
    assert.equal(first.body.data.movies[0].title, "Movie 00");

    const second = await api.get("/movies?page=2");
    assert.equal(second.body.results, 5);
    assert.equal(second.body.data.movies[0].title, "Movie 20");
  });

  it("supports a custom limit, capped at 100", async () => {
    await addMovies(25);
    const page3 = await api.get("/movies?limit=5&page=3");
    assert.equal(page3.body.data.movies[0].title, "Movie 10");
    assert.equal((await api.get("/movies?limit=1000")).body.pagination.limit, 100);
  });

  it("rejects invalid page and limit values", async () => {
    assert.equal((await api.get("/movies?page=0")).status, 400);
    assert.equal((await api.get("/movies?limit=abc")).status, 400);
  });

  it("returns an empty page past the end", async () => {
    await addMovies(3);
    const res = await api.get("/movies?page=5");
    assert.equal(res.status, 200);
    assert.equal(res.body.results, 0);
  });
});

describe("filters", () => {
  it("movies by genre", async () => {
    await addMovies(9);
    const res = await api.get("/movies?genre=Drama");
    assert.equal(res.body.pagination.total, 3);
    assert.ok(res.body.data.movies.every((m) => m.genre === "Drama"));
    assert.equal((await api.get("/movies?genre=Opera")).status, 400);
  });

  it("showtimes by screen, movie and date, earliest first", async () => {
    const admin = await createUser("ADMIN");
    const { screen, movie } = await createShowtime(admin, { startTime: "2031-05-02T19:00:00.000Z" });
    for (const time of ["2031-05-01T21:00:00.000Z", "2031-05-01T15:00:00.000Z"]) {
      created(await api.post("/showTimes").set(admin.auth).send({ movie: movie._id, screen: screen._id, startTime: time, price: 10 }));
    }

    const day = await api.get(`/showTimes?screen=${screen._id}&date=2031-05-01`);
    assert.deepEqual(day.body.data.showtimes.map((s) => s.startTime), ["2031-05-01T15:00:00.000Z", "2031-05-01T21:00:00.000Z"]);
    assert.equal((await api.get(`/showTimes?movie=${movie._id}`)).body.pagination.total, 3);
    assert.equal((await api.get("/showTimes?date=05/01/2031")).status, 400);
    assert.equal((await api.get("/showTimes?screen=nope")).status, 400);
  });

  it("bookings by status, only the customer's own, newest first", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser("CUSTOMER", "Alice");
    const { showtime } = await createShowtime(admin);
    const first = await book(alice, showtime, ["A1"]);
    const second = await book(alice, showtime, ["A2"]);
    await book(admin, showtime, ["A3"]);
    await api.put(`/bookings/${first._id}`).set(alice.auth).send({ status: "cancelled" });

    const all = await api.get("/bookings").set(alice.auth);
    assert.deepEqual(all.body.data.bookings.map((b) => b._id), [second._id, first._id]);
    const cancelled = await api.get("/bookings?status=cancelled").set(alice.auth);
    assert.deepEqual(cancelled.body.data.bookings.map((b) => b._id), [first._id]);
    assert.equal((await api.get("/bookings?status=lost").set(alice.auth)).status, 400);
  });
});
