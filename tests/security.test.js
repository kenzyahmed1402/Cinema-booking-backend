import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, useTestDatabase } from "./helpers.js";

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

  it("limits failed logins to 10 per 15 minutes; successful logins don't count", async () => {
    await api.post("/auth/register").send({ name: "Jane", email: "jane@example.com", password: "password123" });
    const login = (password) => api.post("/auth/login").send({ email: "jane@example.com", password });

    for (let i = 0; i < 9; i++) assert.equal((await login("wrong-password")).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await login("password123")).status, 200);
    assert.equal((await login("wrong-password")).status, 401);

    const blocked = await login("wrong-password");
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.message, /Too many failed attempts/);
    assert.equal((await login("password123")).status, 429);
  });
});
