import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, book, created, createShowtime, createUser, useTestDatabase } from "./helpers.js";

useTestDatabase();

// A 120-minute movie at 19:00 keeps its screen busy until 21:15 (15-minute break)
const setup = async () => {
  const admin = await createUser("ADMIN");
  const { cinema, screen, movie, showtime } = await createShowtime(admin, {
    duration: 120,
    startTime: "2030-03-01T19:00:00.000Z",
  });
  const otherScreen = created(
    await api.post("/screens").set(admin.auth).send({ screenNumber: 2, rows: 10, seatsPerRow: 12, cinema: cinema._id })
  );
  const shortMovie = created(
    await api.post("/movies").set(admin.auth).send({ title: "Short", genre: "Comedy", duration: 90 })
  );
  const add = (time, { onScreen = screen, film = shortMovie } = {}) =>
    api.post("/showTimes").set(admin.auth).send({
      movie: film._id,
      screen: onScreen._id,
      startTime: `2030-03-01T${time}:00.000Z`,
      price: 10,
    });
  return { admin, screen, otherScreen, movie, shortMovie, showtime, add };
};

describe("overlapping showtimes", () => {
  it("block a showing that starts while another is running", async () => {
    const { add } = await setup();
    const res = await add("19:30");
    assert.equal(res.status, 409);
    assert.match(res.body.message, /runs from 2030-03-01T19:00:00\.000Z until 2030-03-01T21:15:00\.000Z/);
  });

  it("block a showing that starts during the break", async () => {
    const { add } = await setup();
    assert.equal((await add("21:10")).status, 409);
  });

  it("allow a showing right after the break", async () => {
    const { add } = await setup();
    assert.equal((await add("21:15")).status, 201);
  });

  it("block an earlier showing that would run into the next one", async () => {
    const { add, movie } = await setup();
    assert.equal((await add("17:30", { film: movie })).status, 409);
    assert.equal((await add("17:15")).status, 201); // 90 min + break ends exactly at 19:00
  });

  it("allow the same time on a different screen", async () => {
    const { add, otherScreen } = await setup();
    assert.equal((await add("19:30", { onScreen: otherScreen })).status, 201);
  });

  it("are checked when a showtime's time, screen or movie changes", async () => {
    const { admin, add, otherScreen, showtime } = await setup();
    const later = created(await add("21:15"));
    await add("19:30", { onScreen: otherScreen });

    const move = (id, changes) => api.put(`/showTimes/${id}`).set(admin.auth).send(changes);
    assert.equal((await move(later._id, { price: 12 })).status, 200);
    assert.equal((await move(later._id, { startTime: "2030-03-01T20:00:00.000Z" })).status, 409);
    assert.equal((await move(showtime._id, { screen: otherScreen._id })).status, 409);

    const epic = created(await api.post("/movies").set(admin.auth).send({ title: "Epic", genre: "Drama", duration: 300 }));
    assert.equal((await move(showtime._id, { movie: epic._id })).status, 409);
  });

  it("reject movies longer than 600 minutes", async () => {
    const admin = await createUser("ADMIN");
    const res = await api.post("/movies").set(admin.auth).send({ title: "Too long", genre: "Drama", duration: 601 });
    assert.equal(res.status, 400);
  });
});

describe("showtime seats", () => {
  it("can't be set or cleared through the showtime API", async () => {
    const admin = await createUser("ADMIN");
    const { showtime, movie, screen } = await createShowtime(admin);
    await book(admin, showtime, ["A1"]);

    const update = await api.put(`/showTimes/${showtime._id}`).set(admin.auth).send({ price: 15, bookedSeats: [] });
    assert.equal(update.status, 200);
    assert.deepEqual(update.body.data.showtime.bookedSeats, ["A1"]);

    const fresh = await api.post("/showTimes").set(admin.auth).send({
      movie: movie._id,
      screen: screen._id,
      startTime: "2030-02-01T19:00:00.000Z",
      price: 10,
      bookedSeats: ["A1", "A2"],
    });
    assert.equal(fresh.status, 201);
    assert.deepEqual(fresh.body.data.showtime.bookedSeats, []);
  });

  it("must fit a screen the showtime is moved to", async () => {
    const admin = await createUser("ADMIN");
    const { showtime, cinema } = await createShowtime(admin);
    const tiny = created(
      await api.post("/screens").set(admin.auth).send({ screenNumber: 2, rows: 2, seatsPerRow: 2, cinema: cinema._id })
    );
    await book(admin, showtime, ["A1", "A3"]);

    const res = await api.put(`/showTimes/${showtime._id}`).set(admin.auth).send({ screen: tiny._id });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /A3/);
  });
});
