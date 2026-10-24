import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import supertest from "supertest";
import mongoose from "mongoose";
import { createApiLimiter } from "../middlewares/rateLimit.js";
import errorHandler from "../middlewares/errorHandler.js";
import { MongoRateLimitStore } from "../utils/rateLimitStore.js";
import { useTestDatabase } from "./helpers.js";

useTestDatabase();

// A separate app with its own limiter, like one more running instance
const instance = (limit) => {
  const app = express();
  app.use(createApiLimiter(limit));
  app.get("/ping", (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return supertest(app);
};

const counts = () => mongoose.connection.collection("ratelimits").find().toArray();

describe("rate limit counts in MongoDB", () => {
  it("are shared by every instance of the app", async () => {
    const first = instance(3);
    const second = instance(3);

    assert.equal((await first.get("/ping")).status, 200);
    assert.equal((await second.get("/ping")).status, 200);
    assert.equal((await first.get("/ping")).status, 200);
    const blocked = await second.get("/ping");
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.message, /Too many requests/);
  });

  it("keep clients' IPs only as hashes, with a window end MongoDB expires", async () => {
    await instance(3).get("/ping");
    const [count] = await counts();
    assert.match(count._id, /^api:[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(count), /127\.0\.0\.1/);
    assert.equal(count.hits, 1);
    assert.ok(count.resetAt > new Date());

    const indexes = await mongoose.connection.collection("ratelimits").indexes();
    assert.ok(indexes.some((index) => index.key.resetAt === 1 && index.expireAfterSeconds === 0));
  });

  it("start again after the window, even before MongoDB deletes the old count", async () => {
    const store = new MongoRateLimitStore("test:");
    store.init({ windowMs: 100 });
    assert.equal((await store.increment("client")).totalHits, 1);
    assert.equal((await store.increment("client")).totalHits, 2);
    assert.equal((await store.get("client")).totalHits, 2);

    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(await store.get("client"), undefined);
    assert.equal((await store.increment("client")).totalHits, 1);
  });

  it("take back hits without going below zero, and reset per client", async () => {
    const store = new MongoRateLimitStore("test:");
    store.init({ windowMs: 60_000 });
    await store.increment("a");
    await store.increment("b");
    await store.decrement("a");
    await store.decrement("a");
    assert.equal((await store.get("a")).totalHits, 0);
    assert.equal((await store.get("b")).totalHits, 1);

    await store.resetKey("b");
    assert.equal(await store.get("b"), undefined);
  });
});
