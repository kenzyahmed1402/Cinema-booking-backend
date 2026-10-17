import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { runScript } from "./runScript.js";

const script = fileURLToPath(new URL("../scripts/seedAdmin.js", import.meta.url));

const seed = (env) => runScript(script, { env });

describe("scripts/seedAdmin.js", () => {
  let mongo;
  before(async () => {
    mongo = await MongoMemoryServer.create();
  });
  after(async () => {
    await mongo.stop();
  });

  it("refuses a missing or short admin password", async () => {
    for (const password of [undefined, "", "password"]) {
      const result = await seed({ MONGO_URI: mongo.getUri("seed"), ...(password !== undefined && { ADMIN_PASSWORD: password }) });
      assert.equal(result.status, 1, `password ${password}`);
      assert.match(result.stderr, /at least 12 characters/);
    }
  });

  it("creates the admin with a strong password, and only once", async () => {
    const env = { MONGO_URI: mongo.getUri("seed"), ADMIN_EMAIL: "boss@example.com", ADMIN_PASSWORD: "a-long-admin-password" };
    const first = await seed(env);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Admin user created successfully/);
    assert.match((await seed(env)).stdout, /Admin user already exists/);

    const connection = await mongoose.createConnection(mongo.getUri("seed")).asPromise();
    const admin = await connection.collection("users").findOne({ email: "boss@example.com" });
    await connection.close();
    assert.equal(admin.role, "ADMIN");
    assert.notEqual(admin.password, "a-long-admin-password");
  });
});
