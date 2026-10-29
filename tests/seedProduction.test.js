import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { DEMO_CINEMAS } from "../scripts/demoCatalogue.js";
import { runScript } from "./runScript.js";

const script = fileURLToPath(new URL("../scripts/seedProduction.js", import.meta.url));

// A folder holding .env.production and, optionally, a local .env beside it
const makeFolder = ({ production, local }) => {
  const folder = mkdtempSync(join(tmpdir(), "seed-prod-"));
  if (production !== undefined) writeFileSync(join(folder, ".env.production"), production);
  if (local !== undefined) writeFileSync(join(folder, ".env"), local);
  return folder;
};

const seed = (folder) => runScript(script, { args: [join(folder, ".env.production")], timeout: 60000 });

describe("scripts/seedProduction.js settings checks", () => {
  const folders = [];
  const folder = (files) => {
    const created = makeFolder(files);
    folders.push(created);
    return created;
  };
  after(() => folders.forEach((f) => rmSync(f, { recursive: true, force: true })));

  it("refuses to run without .env.production", async () => {
    const result = await seed(folder({ local: "MONGO_URI=mongodb://localhost/local\n" }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Copy \.env\.production\.example/);
  });

  it("refuses a missing, invalid or unnamed database", async () => {
    const cases = [
      ["ADMIN_PASSWORD=a-long-admin-password\n", /MONGO_URI is missing/],
      ["MONGO_URI=mongodb+srv://<user>:<password>@<cluster-host>/seatora-prod\n", /not a valid connection string/],
      ["MONGO_URI=mongodb+srv://u:p@cluster0.example.net/?retryWrites=true\n", /needs a database name/],
    ];
    for (const [production, message] of cases) {
      const result = await seed(folder({ production }));
      assert.equal(result.status, 1, production);
      assert.match(result.stderr, message);
    }
  });

  it("refuses the database the local .env uses, and never prints the password", async () => {
    const result = await seed(
      folder({
        production: "MONGO_URI=mongodb+srv://prod-user:prod-secret-pw@cluster0.example.net/seatora?w=majority\n",
        local: "MONGO_URI=mongodb+srv://dev-user:dev-secret-pw@cluster0.example.net/seatora\n",
      })
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /point at the same database/);
    assert.doesNotMatch(result.stdout + result.stderr, /secret-pw/);
  });
});

describe("scripts/seedProduction.js seeding", () => {
  let mongo;
  let folder;
  before(async () => {
    mongo = await MongoMemoryServer.create();
  });
  after(async () => {
    await mongo.stop();
    rmSync(folder, { recursive: true, force: true });
  });

  it("adds the catalogue and admin from .env.production only, ignoring the local .env", async () => {
    folder = makeFolder({
      production: [
        `MONGO_URI=${mongo.getUri("seatora-prod")}`,
        "ADMIN_EMAIL=prod-admin@example.com",
        "ADMIN_PASSWORD=a-long-production-password",
      ].join("\n"),
      // Must not be used, not even for settings .env.production leaves out
      local: [`MONGO_URI=${mongo.getUri("seatora-local")}`, "CINEMA_TZ=Not/AZone"].join("\n"),
    });

    const result = await seed(folder);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Seeding the database "seatora-prod"/);
    assert.match(result.stdout, /Demo catalogue added/);
    assert.match(result.stdout, /Admin user created successfully/);

    const connection = await mongoose.createConnection(mongo.getUri()).asPromise();
    const prod = connection.useDb("seatora-prod");
    assert.equal(await prod.collection("cinemas").countDocuments(), DEMO_CINEMAS.length);
    const admin = await prod.collection("users").findOne({ email: "prod-admin@example.com" });
    assert.equal(admin.role, "ADMIN");
    assert.equal(await connection.useDb("seatora-local").collection("cinemas").countDocuments(), 0);
    await connection.close();
  });

  it("stops at the first failing step", async () => {
    const other = makeFolder({
      production: [
        `MONGO_URI=${mongo.getUri("seatora-other")}`,
        "CINEMA_TZ=Not/AZone",
        "ADMIN_PASSWORD=a-long-production-password",
      ].join("\n"),
    });
    const result = await seed(other);
    rmSync(other, { recursive: true, force: true });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a valid time zone/);
    assert.doesNotMatch(result.stdout, /Admin user created/);
  });
});
