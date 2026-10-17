import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { api, createUser, useTestDatabase } from "./helpers.js";

useTestDatabase();

describe("register and login", () => {
  it("register creates a customer with a hashed password, even if ADMIN is requested", async () => {
    const res = await api.post("/auth/register").send({
      name: "Sneaky",
      email: "sneaky@example.com",
      password: "password123",
      role: "ADMIN",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.role, "CUSTOMER");
    assert.ok(res.body.token);
    assert.equal(res.body.data.user.password, undefined);

    const stored = await User.findOne({ email: "sneaky@example.com" }).select("+password");
    assert.notEqual(stored.password, "password123");
    assert.ok(await stored.comparePassword("password123"));
  });

  it("an email can only be registered once", async () => {
    const body = { name: "A", email: "twice@example.com", password: "password123" };
    await api.post("/auth/register").send(body);
    const res = await api.post("/auth/register").send(body);
    assert.equal(res.status, 409);
  });

  it("login returns a token that works, and rejects a wrong password", async () => {
    await api.post("/auth/register").send({ name: "Jane", email: "jane@example.com", password: "password123" });

    const wrong = await api.post("/auth/login").send({ email: "jane@example.com", password: "nope-nope" });
    assert.equal(wrong.status, 401);

    const ok = await api.post("/auth/login").send({ email: "jane@example.com", password: "password123" });
    assert.equal(ok.status, 200);
    const me = await api.get("/auth/me").set("Authorization", `Bearer ${ok.body.token}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.email, "jane@example.com");
  });
});

describe("registration limits", () => {
  const register = (overrides) =>
    api.post("/auth/register").send({ name: "Jane", email: "limits@example.com", password: "password123", ...overrides });

  it("rejects emails over 254 characters and passwords under 8 characters", async () => {
    const email = await register({ email: `${"a".repeat(250)}@example.com` });
    assert.equal(email.status, 400);
    assert.match(email.body.message, /email must have at most 254 characters/);
    const short = await register({ password: "short" });
    assert.equal(short.status, 400);
    assert.match(short.body.message, /password must have at least 8 characters/);
  });

  it("accepts passwords up to 72 bytes, counting bytes rather than characters", async () => {
    assert.equal((await register({ password: "p".repeat(73) })).status, 400);
    // 19 emoji = 19 characters but 76 bytes
    const emoji = await register({ password: "\u{1F600}".repeat(19) });
    assert.equal(emoji.status, 400);
    assert.match(emoji.body.message, /password is too long \(at most 72 bytes\)/);
    assert.equal((await register({ password: "p".repeat(72) })).status, 201);
  });
});

describe("tokens and roles", () => {
  it("missing, invalid, tampered and expired tokens get 401", async () => {
    const { user, token } = await createUser();
    const expired = jwt.sign({ id: user._id, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
    const cases = [
      [undefined, /not logged in/],
      ["garbage", /Invalid token/],
      [token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA"), /Invalid token/],
      [jwt.sign({ id: user._id }, "a-different-secret"), /Invalid token/],
      [expired, /expired/],
    ];
    for (const [value, message] of cases) {
      const req = api.get("/auth/me");
      if (value) req.set("Authorization", `Bearer ${value}`);
      const res = await req;
      assert.equal(res.status, 401, `token ${value}`);
      assert.match(res.body.message, message);
    }
  });

  it("only accept tokens signed with HS256", async () => {
    const { user, token } = await createUser();
    assert.equal(JSON.parse(Buffer.from(token.split(".")[0], "base64url")).alg, "HS256");

    // Same secret, different algorithm: must be rejected
    const hs512 = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { algorithm: "HS512" });
    const res = await api.get("/auth/me").set("Authorization", `Bearer ${hs512}`);
    assert.equal(res.status, 401);
  });

  it("customers get 403 on admin-only actions", async () => {
    const customer = await createUser();
    const res = await api.post("/movies").set(customer.auth).send({ title: "M", genre: "Drama", duration: 90 });
    assert.equal(res.status, 403);
  });
});
