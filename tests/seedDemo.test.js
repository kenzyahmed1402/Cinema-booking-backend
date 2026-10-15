import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { DEMO_CINEMAS, DEMO_DAYS, DEMO_MOVIES, planShowtimes } from "../scripts/demoCatalogue.js";
import { localParts } from "../utils/timezone.js";

const MINUTE = 60 * 1000;
const timeZone = "Africa/Cairo";
const now = new Date("2026-10-20T10:00:00.000Z");

describe("demo showtime plan", () => {
  const plan = planShowtimes({ now, timeZone });

  it("never overlaps showings on the same screen, including the 15-minute break", () => {
    const byScreen = Map.groupBy(plan, (s) => `${s.cinemaIndex}-${s.screenIndex}`);
    assert.equal(byScreen.size, DEMO_CINEMAS.flatMap((c) => c.screens).length);
    for (const showings of byScreen.values()) {
      showings.sort((a, b) => a.startTime - b.startTime);
      for (let i = 1; i < showings.length; i++) {
        const previous = showings[i - 1];
        const endsAt = previous.startTime.getTime() + (DEMO_MOVIES[previous.movieIndex].duration + 15) * MINUTE;
        assert.ok(showings[i].startTime.getTime() >= endsAt, `overlap at ${showings[i].startTime.toISOString()}`);
      }
    }
  });

  it("only plans future showings between 13:00 and 22:30 local time", () => {
    for (const { startTime } of plan) {
      assert.ok(startTime > now);
      const { hour, minute } = localParts(startTime, timeZone);
      const minutes = hour * 60 + minute;
      assert.ok(minutes >= 13 * 60 && minutes <= 22 * 60 + 30, `${hour}:${minute}`);
    }
  });

  it("plays every movie on every day, at prices that allow two seats under $30", () => {
    const days = Map.groupBy(plan, (s) => localParts(s.startTime, timeZone).day);
    assert.equal(days.size, DEMO_DAYS);
    for (const showings of days.values()) {
      assert.equal(new Set(showings.map((s) => s.movieIndex)).size, DEMO_MOVIES.length);
    }
    const prices = plan.map((s) => s.price);
    assert.ok(Math.min(...prices) >= 8 && Math.max(...prices) <= 16);
    assert.ok(prices.some((price) => price * 2 < 30));
  });
});

const script = fileURLToPath(new URL("../scripts/seedDemo.js", import.meta.url));

// Runs the seed script from a temp folder so no .env file fills in values
const seed = (env, args = []) =>
  spawnSync(process.execPath, [script, ...args], {
    cwd: tmpdir(),
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
    timeout: 30000,
  });

describe("scripts/seedDemo.js", () => {
  let mongo;
  let db;
  let uri;
  before(async () => {
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri("demo");
    db = (await mongoose.createConnection(uri).asPromise()).db;
  });
  after(async () => {
    await db.client.close();
    await mongo.stop();
  });

  const count = (name) => db.collection(name).countDocuments();

  it("refuses to run without MONGO_URI or with an invalid CINEMA_TZ", () => {
    assert.match(seed({}).stderr, /MONGO_URI must be set/);
    const badZone = seed({ MONGO_URI: uri, CINEMA_TZ: "Nowhere/Town" });
    assert.equal(badZone.status, 1);
    assert.match(badZone.stderr, /not a valid time zone/);
  });

  it("adds the catalogue once, with seat layouts", async () => {
    const first = seed({ MONGO_URI: uri });
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Demo catalogue added: 3 cinemas, 6 screens, 8 movies/);
    assert.equal(await count("cinemas"), DEMO_CINEMAS.length);
    assert.equal(await count("movies"), DEMO_MOVIES.length);
    const showtimes = await count("showtimes");
    assert.ok(showtimes > 0);

    const screen = await db.collection("screens").findOne({ screenNumber: 1 });
    assert.equal(screen.capacity, screen.rows * screen.seatsPerRow);

    const second = seed({ MONGO_URI: uri });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /nothing was added/);
    assert.equal(await count("cinemas"), DEMO_CINEMAS.length);
    assert.equal(await count("showtimes"), showtimes);
  });

  it("refuses --reset in production and while bookings exist", async () => {
    const production = seed({ MONGO_URI: uri, NODE_ENV: "production" }, ["--reset"]);
    assert.equal(production.status, 1);
    assert.match(production.stderr, /disabled when NODE_ENV=production/);

    await db.collection("bookings").insertOne({ seats: ["A1"] });
    const withBooking = seed({ MONGO_URI: uri }, ["--reset"]);
    assert.equal(withBooking.status, 1);
    assert.match(withBooking.stderr, /1 booking\(s\) exist/);
    assert.equal(await count("cinemas"), DEMO_CINEMAS.length);
    await db.collection("bookings").deleteMany({});
  });

  it("--reset replaces the catalogue and keeps users", async () => {
    await db.collection("users").insertOne({ email: "keep@example.com" });
    await db.collection("movies").insertOne({ title: "Extra", genre: "Drama", duration: 90 });

    const result = seed({ MONGO_URI: uri }, ["--reset"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await count("movies"), DEMO_MOVIES.length);
    assert.equal(await count("cinemas"), DEMO_CINEMAS.length);
    assert.equal(await count("users"), 1);
  });
});
