import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { findConfigProblems } from "../config/env.js";

const goodSecret = "a".repeat(64);

describe("startup configuration", () => {
  it("accepts a complete configuration", () => {
    assert.deepEqual(findConfigProblems({ MONGO_URI: "mongodb://localhost/db", JWT_SECRET: goodSecret }), []);
  });

  it("reports a missing MONGO_URI and JWT_SECRET", () => {
    assert.deepEqual(findConfigProblems({}), ["MONGO_URI is missing", "JWT_SECRET is missing"]);
  });

  it("rejects a short JWT_SECRET and the example value", () => {
    const short = findConfigProblems({ MONGO_URI: "x", JWT_SECRET: "secret" });
    assert.match(short[0], /at least 32 characters/);
    const example = findConfigProblems({ MONGO_URI: "x", JWT_SECRET: "your_super_secret_random_string_at_least_32_characters" });
    assert.match(example[0], /example value/);
  });

  it("server.js exits with a clear message instead of starting", () => {
    const server = fileURLToPath(new URL("../server.js", import.meta.url));
    // Run from a temp folder so no .env file fills in the missing values
    const result = spawnSync(process.execPath, [server], {
      cwd: tmpdir(),
      env: { PATH: process.env.PATH, MONGO_URI: "", JWT_SECRET: "too-short" },
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Can't start the server/);
    assert.match(result.stderr, /MONGO_URI is missing/);
    assert.match(result.stderr, /JWT_SECRET must be at least 32 characters/);
  });
});
