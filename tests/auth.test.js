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

  it("customers get 403 on admin-only actions", async () => {
    const customer = await createUser();
    const res = await api.post("/movies").set(customer.auth).send({ title: "M", genre: "Drama", duration: 90 });
    assert.equal(res.status, 403);
  });
});
