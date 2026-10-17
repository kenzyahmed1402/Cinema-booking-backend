import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import supertest from "supertest";
import { createApiLimiter } from "../middlewares/rateLimit.js";
import errorHandler from "../middlewares/errorHandler.js";
import { api, createUser, useTestDatabase } from "./helpers.js";

useTestDatabase();

describe("security", () => {
  it("sets security headers and hides X-Powered-By", async () => {
    const res = await api.get("/nothing-here");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["x-powered-by"], undefined);
  });

  it("allows browser requests from other origins (CORS_ORIGIN not set)", async () => {
    const res = await api
      .options("/bookings")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");
    assert.equal(res.status, 204);
    assert.equal(res.headers["access-control-allow-origin"], "http://localhost:5173");
  });

  it("limits all requests per IP with the general rate limit", async () => {
    const small = express();
    small.use(createApiLimiter(3));
    small.get("/ping", (req, res) => res.json({ ok: true }));
    small.use(errorHandler);
    const client = supertest(small);

    for (let i = 0; i < 3; i++) assert.equal((await client.get("/ping")).status, 200);
    const blocked = await client.get("/ping");
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.message, /Too many requests/);
  });

  it("applies the general rate limit to the API", async () => {
    const res = await api.get("/movies");
    assert.ok(res.headers["ratelimit-policy"] || res.headers["ratelimit"], "rate limit headers missing");
  });

  it("limits failed logins to 10 per 15 minutes; successful logins don't count", async () => {
    // A test user with a cheap password hash keeps the 16 logins fast
    const { user } = await createUser();
    const login = (password) => api.post("/auth/login").send({ email: user.email, password });

    for (let i = 0; i < 9; i++) assert.equal((await login("wrong-password")).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await login("password123")).status, 200);
    assert.equal((await login("wrong-password")).status, 401);

    const blocked = await login("wrong-password");
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.message, /Too many failed attempts/);
    assert.equal((await login("password123")).status, 429);
  });
});
