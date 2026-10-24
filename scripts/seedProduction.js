// Seeds the deployed database from your own computer: the demo catalogue,
// then the admin account.
//
//   npm run seed:prod
//
// Settings come only from .env.production (gitignored), which you fill in
// with an editor, so the connection string never goes through the terminal
// or its history. Your local .env is never read, and the catalogue is only
// added when the database has none (there is no --reset here).
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const envFile = resolve(process.argv[2] ?? ".env.production");

if (!existsSync(envFile)) {
  fail(`${envFile} not found. Copy .env.production.example to .env.production and fill it in.`);
}
const settings = dotenv.parse(readFileSync(envFile));

// The cluster and database a connection string points at. Never the
// username or password, so it is safe to print.
const target = (uri) => {
  try {
    const url = new URL(uri);
    return { host: url.hostname, database: url.pathname.slice(1) };
  } catch {
    return null;
  }
};

const production = target(settings.MONGO_URI);
if (!settings.MONGO_URI) {
  fail("MONGO_URI is missing in .env.production.");
}
if (!production) {
  fail("MONGO_URI in .env.production is not a valid connection string.");
}
// Without a name MongoDB silently uses a database called "test"
if (!production.database) {
  fail("MONGO_URI in .env.production needs a database name, e.g. .../cinemate-prod?retryWrites=true");
}

// The deployed app gets its own database, so local testing never touches it
const localEnvFile = join(dirname(envFile), ".env");
if (existsSync(localEnvFile)) {
  const local = target(dotenv.parse(readFileSync(localEnvFile)).MONGO_URI);
  if (local && local.host === production.host && local.database === production.database) {
    fail(`.env and .env.production point at the same database (${production.database}). Use a separate one.`);
  }
}

const env = {
  ...process.env,
  ...settings,
  NODE_ENV: "production",
  // The seed scripts load this file instead of .env, so nothing missing here
  // is filled in from your local settings
  DOTENV_CONFIG_PATH: envFile,
  DOTENV_CONFIG_QUIET: "true",
};

const run = (script) =>
  new Promise((done, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
      cwd: dirname(envFile),
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", done);
  });

console.log(`Seeding the database "${production.database}" from ${envFile}`);
for (const script of ["./seedDemo.js", "./seedAdmin.js"]) {
  const status = await run(script);
  if (status !== 0) {
    process.exit(status ?? 1);
  }
}
