import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, createUser, useTestDatabase } from "./helpers.js";

useTestDatabase();

// The session cookie from a response, as a browser would send it back
const sessionFrom = (res) => {
  const header = (res.headers["set-cookie"] ?? []).find((cookie) => cookie.startsWith("seatora_session="));
  assert.ok(header, "no session cookie was set");
  return { header, cookie: header.split(";")[0] };
};

describe("cookie login for the web app", () => {
  it("sets an HTTP-only, secure, same-site cookie on login that logs the browser in", async () => {
    const { user } = await createUser();
    const res = await api.post("/auth/login").send({ email: user.email, password: "password123" });
    assert.equal(res.status, 200);

    const { header, cookie } = sessionFrom(res);
    assert.match(header, /HttpOnly/);
    assert.match(header, /Secure/);
    assert.match(header, /SameSite=Strict/);
    assert.match(header, /Path=\//);
    assert.match(header, /Expires=/);

    const me = await api.get("/auth/me").set("Cookie", `other=1; ${cookie}; theme=dark`);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.email, user.email);
  });

  it("sets the cookie on register too, and still returns the token for API clients", async () => {
    const res = await api.post("/auth/register").send({ name: "New", email: "new@example.com", password: "a-long-password" });
    assert.equal(res.status, 201);
    assert.equal(typeof res.body.token, "string");
    const { cookie } = sessionFrom(res);
    assert.equal((await api.get("/auth/me").set("Cookie", cookie)).status, 200);
  });

  it("logs out by deleting the cookie", async () => {
    const res = await api.post("/auth/logout");
    assert.equal(res.status, 204);
    const { header } = sessionFrom(res);
    assert.match(header, /^seatora_session=;/);
    assert.match(header, /Expires=Thu, 01 Jan 1970/);
  });

  it("refuses a missing or forged cookie, and prefers a Bearer header", async () => {
    const alice = await createUser();
    const bob = await createUser();
    assert.equal((await api.get("/auth/me")).status, 401);
    assert.equal((await api.get("/auth/me").set("Cookie", "seatora_session=not-a-token")).status, 401);

    const me = await api.get("/auth/me").set(alice.auth).set("Cookie", `seatora_session=${bob.token}`);
    assert.equal(me.body.data.user.email, alice.user.email);
  });
});
