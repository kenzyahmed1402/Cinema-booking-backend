import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Screen from "../models/screens.js";
import { api, book, created, createShowtime, createUser, useTestDatabase } from "./helpers.js";

useTestDatabase();

describe("screen layouts", () => {
  it("calculate capacity from rows x seats per row", async () => {
    const admin = await createUser("ADMIN");
    const cinema = created(await api.post("/cinemas").set(admin.auth).send({ name: "C", location: "L" }));
    const res = await api.post("/screens").set(admin.auth).send({
      screenNumber: 1,
      rows: 10,
      seatsPerRow: 12,
      capacity: 5,
      cinema: cinema._id,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.screen.capacity, 120);
  });

  it("reject more than 26 rows and screens without a layout", async () => {
    const admin = await createUser("ADMIN");
    const cinema = created(await api.post("/cinemas").set(admin.auth).send({ name: "C", location: "L" }));
    const tooMany = await api.post("/screens").set(admin.auth).send({ screenNumber: 1, rows: 27, seatsPerRow: 10, cinema: cinema._id });
    assert.equal(tooMany.status, 400);
    const noLayout = await api.post("/screens").set(admin.auth).send({ screenNumber: 2, capacity: 50, cinema: cinema._id });
    assert.equal(noLayout.status, 400);
  });

  it("reject a second screen with the same number in a cinema", async () => {
    const admin = await createUser("ADMIN");
    const { cinema } = await createShowtime(admin);
    const res = await api.post("/screens").set(admin.auth).send({ screenNumber: 1, rows: 5, seatsPerRow: 5, cinema: cinema._id });
    assert.equal(res.status, 409);
  });

  it("can't shrink below seats that are already booked", async () => {
    const admin = await createUser("ADMIN");
    const { screen, showtime } = await createShowtime(admin, { rows: 5, seatsPerRow: 10 });
    await book(admin, showtime, ["A1", "A3"]);

    const blocked = await api.put(`/screens/${screen._id}`).set(admin.auth).send({ seatsPerRow: 2 });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.message, /A3/);

    const allowed = await api.put(`/screens/${screen._id}`).set(admin.auth).send({ rows: 1 });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.data.screen.capacity, 10);
  });

  it("older screens need both rows and seatsPerRow to get a layout", async () => {
    const admin = await createUser("ADMIN");
    const cinema = created(await api.post("/cinemas").set(admin.auth).send({ name: "C", location: "L" }));
    const old = await Screen.create({ cinema: cinema._id, screenNumber: 1, capacity: 30 });

    const onlyRows = await api.put(`/screens/${old._id}`).set(admin.auth).send({ rows: 3 });
    assert.equal(onlyRows.status, 400);
    const both = await api.put(`/screens/${old._id}`).set(admin.auth).send({ rows: 3, seatsPerRow: 10 });
    assert.equal(both.status, 200);
    assert.equal(both.body.data.screen.capacity, 30);
  });
});
