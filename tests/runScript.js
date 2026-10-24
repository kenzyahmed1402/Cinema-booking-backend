import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

// Runs a Node script in a child process and resolves to { status, stdout,
// stderr }. Runs from a temp folder so no .env file fills in values.
//
// Asynchronous on purpose: the test's in-memory MongoDB is a child of the
// test process, which has to keep reading its output. spawnSync would block
// that, the database would stall once its output pipe filled up, and the
// script would hang.
export const runScript = (script, { args = [], env = {}, timeout = 30000 } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: tmpdir(),
      env: { PATH: process.env.PATH, ...env },
      timeout,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
