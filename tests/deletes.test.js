import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, book, created, createShowtime, createUser, useTestDatabase } from "./helpers.js";

useTestDatabase();

// A cinema with two screens, one movie showing on both, an active booking on
// the first showtime and a cancelled booking on the second
const setup = async () => {
  const admin = await createUser("ADMIN");
  const { cinema, screen, movie, showtime } = await createShowtime(admin);
  const screen2 = created(
    await api.post("/screens").set(admin.auth).send({ screenNumber: 2, rows: 10, seatsPerRow: 12, cinema: cinema._id })
  );
  const showtime2 = created(
    await api.post("/showTimes").set(admin.auth).send({
      movie: movie._id,
      screen: screen2._id,
      startTime: "2030-01-01T19:00:00.000Z",
      price: 10,
    })
  );
  const active = await book(admin, showtime, ["A1"]);
  const cancelled = await book(admin, showtime2, ["A1"]);
  await api.put(`/bookings/${cancelled._id}`).set(admin.auth).send({ status: "cancelled" });

  const del = (path) => api.delete(path).set(admin.auth);
  const exists = async (path) => (await api.get(path).set(admin.auth)).status === 200;
  return { admin, cinema, screen, screen2, movie, showtime, showtime2, active, cancelled, del, exists };
};

describe("deleting", () => {
  it("a showtime with an active booking is blocked", async () => {
    const { del, showtime, exists } = await setup();
    const res = await del(`/showTimes/${showtime._id}`);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /1 active booking/);
    assert.ok(await exists(`/showTimes/${showtime._id}`));
  });

  it("a showtime with only cancelled bookings removes those bookings too", async () => {
    const { del, showtime2, cancelled, exists } = await setup();
    assert.equal((await del(`/showTimes/${showtime2._id}`)).status, 204);
    assert.equal(await exists(`/bookings/${cancelled._id}`), false);
  });

  it("a movie, screen or cinema is blocked while one of its showtimes has an active booking", async () => {
    const { del, movie, screen, cinema, exists } = await setup();
    assert.equal((await del(`/movies/${movie._id}`)).status, 409);
    assert.equal((await del(`/screens/${screen._id}`)).status, 409);
    assert.equal((await del(`/cinemas/${cinema._id}`)).status, 409);
    assert.ok(await exists(`/movies/${movie._id}`));
    assert.ok(await exists(`/screens/${screen._id}`));
    assert.ok(await exists(`/cinemas/${cinema._id}`));
  });

  it("a screen without active bookings removes its showtimes", async () => {
    const { del, screen2, showtime2, exists } = await setup();
    assert.equal((await del(`/screens/${screen2._id}`)).status, 204);
    assert.equal(await exists(`/showTimes/${showtime2._id}`), false);
  });

  it("a cinema removes its screens, showtimes and cancelled bookings once nothing is active", async () => {
    const { admin, del, cinema, screen, screen2, showtime, showtime2, active, movie, exists } = await setup();
    await api.put(`/bookings/${active._id}`).set(admin.auth).send({ status: "cancelled" });

    assert.equal((await del(`/cinemas/${cinema._id}`)).status, 204);
    for (const path of [`/screens/${screen._id}`, `/screens/${screen2._id}`, `/showTimes/${showtime._id}`, `/showTimes/${showtime2._id}`, `/bookings/${active._id}`]) {
      assert.equal(await exists(path), false, path);
    }
    assert.ok(await exists(`/movies/${movie._id}`));
    assert.equal((await del(`/movies/${movie._id}`)).status, 204);
  });

  it("something that doesn't exist returns 404", async () => {
    const { del } = await setup();
    assert.equal((await del("/cinemas/65a0000000000000000000ff")).status, 404);
  });
});
