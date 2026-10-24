import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, useTestDatabase } from "./helpers.js";

describe("GET /health", () => {
  describe("without a database connection", () => {
    it("reports 503 so the platform knows the app isn't ready", async () => {
      const res = await api.get("/health");
      assert.equal(res.status, 503);
      assert.deepEqual(res.body, { status: "error", database: "disconnected" });
    });
  });

  describe("with a database connection", () => {
    useTestDatabase();

    it("reports ok and nothing else, outside the general rate limit", async () => {
      const res = await api.get("/health");
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { status: "ok", database: "connected" });
      assert.equal(res.headers["ratelimit-policy"], undefined);
      const other = await api.get("/movies");
      assert.ok(other.headers["ratelimit-policy"], "other routes are rate limited");
    });
  });
});
