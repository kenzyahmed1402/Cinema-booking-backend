import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const script = fileURLToPath(new URL("../scripts/seedAdmin.js", import.meta.url));

// Runs the seed script from a temp folder so no .env file fills in values
const seed = (env) =>
  spawnSync(process.execPath, [script], {
    cwd: tmpdir(),
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
    timeout: 30000,
  });

describe("scripts/seedAdmin.js", () => {
  let mongo;
  before(async () => {
    mongo = await MongoMemoryServer.create();
  });
  after(async () => {
    await mongo.stop();
  });

  it("refuses a missing or short admin password", () => {
    for (const password of [undefined, "", "password"]) {
      const result = seed({ MONGO_URI: mongo.getUri("seed"), ...(password !== undefined && { ADMIN_PASSWORD: password }) });
      assert.equal(result.status, 1, `password ${password}`);
      assert.match(result.stderr, /at least 12 characters/);
    }
  });

  it("creates the admin with a strong password, and only once", async () => {
    const env = { MONGO_URI: mongo.getUri("seed"), ADMIN_EMAIL: "boss@example.com", ADMIN_PASSWORD: "a-long-admin-password" };
    const first = seed(env);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Admin user created successfully/);
    assert.match(seed(env).stdout, /Admin user already exists/);

    const connection = await mongoose.createConnection(mongo.getUri("seed")).asPromise();
    const admin = await connection.collection("users").findOne({ email: "boss@example.com" });
    await connection.close();
    assert.equal(admin.role, "ADMIN");
    assert.notEqual(admin.password, "a-long-admin-password");
  });
});
