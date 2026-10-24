import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { findConfigProblems } from "../config/env.js";

const goodSecret = "a".repeat(64);
const good = { MONGO_URI: "mongodb://localhost/db", JWT_SECRET: goodSecret, PAYPAL_ENV: "sandbox" };

describe("startup configuration", () => {
  it("accepts a complete configuration", () => {
    assert.deepEqual(findConfigProblems(good), []);
    assert.deepEqual(
      findConfigProblems({ ...good, PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret" }),
      []
    );
  });

  it("reports a missing MONGO_URI, JWT_SECRET and PAYPAL_ENV", () => {
    assert.deepEqual(findConfigProblems({}), [
      "MONGO_URI is missing",
      "JWT_SECRET is missing",
      "PAYPAL_ENV must be set to sandbox (live PayPal is not supported)",
    ]);
  });

  it("refuses any PayPal environment other than sandbox", () => {
    for (const PAYPAL_ENV of ["live", "production", "SANDBOX", ""]) {
      assert.deepEqual(findConfigProblems({ ...good, PAYPAL_ENV }), [
        "PAYPAL_ENV must be set to sandbox (live PayPal is not supported)",
      ]);
    }
  });

  it("requires the PayPal client ID and secret together", () => {
    const expected = ["PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set together"];
    assert.deepEqual(findConfigProblems({ ...good, PAYPAL_CLIENT_ID: "id" }), expected);
    assert.deepEqual(findConfigProblems({ ...good, PAYPAL_CLIENT_SECRET: "secret" }), expected);
  });

  it("rejects a short JWT_SECRET and the example value", () => {
    const short = findConfigProblems({ ...good, JWT_SECRET: "secret" });
    assert.match(short[0], /at least 32 characters/);
    const example = findConfigProblems({ ...good, JWT_SECRET: "your_super_secret_random_string_at_least_32_characters" });
    assert.match(example[0], /example value/);
  });

  it("server.js exits with a clear message instead of starting", () => {
    const server = fileURLToPath(new URL("../server.js", import.meta.url));
    // Run from a temp folder so no .env file fills in the missing values
    const result = spawnSync(process.execPath, [server], {
      cwd: tmpdir(),
      env: { PATH: process.env.PATH, MONGO_URI: "", JWT_SECRET: "too-short", PAYPAL_ENV: "live" },
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Can't start the server/);
    assert.match(result.stderr, /MONGO_URI is missing/);
    assert.match(result.stderr, /JWT_SECRET must be at least 32 characters/);
    assert.match(result.stderr, /PAYPAL_ENV must be set to sandbox/);
  });
});
