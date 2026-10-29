import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectOnce } from "../config/db.js";
import { runScript } from "./runScript.js";

const appModule = fileURLToPath(new URL("../app.js", import.meta.url));

describe("loading the app on Vercel", () => {
  it("refuses to load with unsafe settings", async () => {
    const result = await runScript(appModule, { env: { VERCEL: "1", PAYPAL_ENV: "live" } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /fix these settings/);
    assert.match(result.stderr, /MONGO_URI is missing/);
    assert.match(result.stderr, /PAYPAL_ENV must be set to sandbox/);
  });

  it("loads with complete settings, without connecting yet", async () => {
    const result = await runScript(appModule, {
      env: {
        VERCEL: "1",
        MONGO_URI: "mongodb://127.0.0.1:1/never-used",
        JWT_SECRET: "a".repeat(64),
        PAYPAL_ENV: "sandbox",
      },
    });
    assert.equal(result.status, 0, result.stderr);
  });
});

describe("connectOnce", () => {
  const savedUri = process.env.MONGO_URI;
  after(() => {
    process.env.MONGO_URI = savedUri;
  });

  it("answers 503 without the connection details when the database is down, and tries again next time", async () => {
    process.env.MONGO_URI = "mongodb://user:db-secret-pw@127.0.0.1:1/seatora";
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(connectOnce({ serverSelectionTimeoutMS: 300 }), (err) => {
        assert.equal(err.statusCode, 503);
        assert.doesNotMatch(err.message, /db-secret-pw|127\.0\.0\.1/);
        return true;
      });
    }
  });

  describe("with a database", () => {
    let mongo;
    before(async () => {
      mongo = await MongoMemoryServer.create();
    });
    after(async () => {
      await mongoose.disconnect();
      await mongo.stop();
    });

    it("connects once and reuses the connection", async () => {
      process.env.MONGO_URI = mongo.getUri("seatora");
      await Promise.all([connectOnce(), connectOnce()]);
      assert.equal(mongoose.connection.readyState, 1);
      assert.equal(mongoose.connection.name, "seatora");
      await connectOnce();
      assert.equal(mongoose.connections.length, 1);
    });

    it("sends queries straight to the driver instead of holding them back", async () => {
      process.env.MONGO_URI = mongo.getUri("seatora");
      await connectOnce();
      const Probe = mongoose.model("Probe", new mongoose.Schema({ n: Number }));
      // What a query sees when Mongoose thinks the collection isn't ready,
      // as after Vercel pauses an instance. With buffering it would wait
      // 10 seconds and fail.
      Probe.collection.buffer = true;
      const started = Date.now();
      await Probe.create({ n: 1 });
      assert.equal(await Probe.countDocuments(), 1);
      assert.ok(Date.now() - started < 5000);
    });
  });
});
