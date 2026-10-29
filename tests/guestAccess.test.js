import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, createShowtime, createUser, useTestDatabase } from "./helpers.js";
import { setModelClient } from "../services/geminiClient.js";
import AgentConversation from "../models/AgentConversation.js";
import AgentProposal from "../models/AgentProposal.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";

useTestDatabase();

// The cookies a response sets, as "name=value" to send back like a browser
const cookiesFrom = (res) => (res.headers["set-cookie"] ?? []).map((cookie) => cookie.split(";")[0]).filter((c) => !c.endsWith("="));
const cookieHeader = (...lists) => lists.flat().join("; ");

const say = (text) => ({ content: { role: "model", parts: [{ text }] }, functionCalls: [], text });
const ask = (name, args) => ({
  content: { role: "model", parts: [{ functionCall: { name, args } }] },
  functionCalls: [{ name, args }],
});

// A fake model giving these answers in order; answers can read the request
let requests;
const scriptedModel = (...steps) => {
  requests = [];
  setModelClient({
    generate: async (request) => {
      requests.push(structuredClone(request));
      const step = steps.shift();
      return typeof step === "function" ? step(request) : step;
    },
  });
};
afterEach(() => setModelClient(null));

const lastResults = (request) => request.contents.at(-1).parts.map((part) => part.functionResponse.response);

describe("guest accounts", () => {
  it("are created with one click and logged in through the cookie", async () => {
    const res = await api.post("/auth/guest");
    assert.equal(res.status, 201);
    const user = res.body.data.user;
    assert.equal(user.isGuest, true);
    assert.equal(user.role, "CUSTOMER");
    assert.match(user.email, /@guest\.invalid$/);
    assert.ok(user.guestExpiresAt);

    const me = await api.get("/auth/me").set("Cookie", cookieHeader(cookiesFrom(res)));
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user._id, user._id);
  });

  it("are kept once they book, and can become a normal account with their bookings", async () => {
    const admin = await createUser("ADMIN");
    const { showtime } = await createShowtime(admin);
    const guest = await api.post("/auth/guest");
    const cookie = cookieHeader(cookiesFrom(guest));

    const booked = await api.post("/bookings").set("Cookie", cookie).send({ showtime: showtime._id, seats: ["A1"] });
    assert.equal(booked.status, 201);
    assert.equal((await User.findById(guest.body.data.user._id)).guestExpiresAt, undefined);

    const upgraded = await api
      .post("/auth/upgrade")
      .set("Cookie", cookie)
      .send({ name: "Mona", email: "mona@example.com", password: "a-long-password" });
    assert.equal(upgraded.status, 200);
    assert.equal(upgraded.body.data.user.isGuest, false);
    assert.equal(upgraded.body.data.user.email, "mona@example.com");

    const login = await api.post("/auth/login").send({ email: "mona@example.com", password: "a-long-password" });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.user._id, guest.body.data.user._id);
    assert.equal(await Booking.countDocuments({ user: guest.body.data.user._id }), 1);
  });

  it("can't upgrade a normal account or take an email that's in use", async () => {
    const alice = await createUser();
    const body = { name: "X", email: alice.user.email, password: "a-long-password" };
    assert.equal((await api.post("/auth/upgrade").set(alice.auth).send(body)).status, 409);

    const guest = await api.post("/auth/guest");
    const taken = await api.post("/auth/upgrade").set("Cookie", cookieHeader(cookiesFrom(guest))).send(body);
    assert.equal(taken.status, 409);
    assert.equal((await api.post("/auth/upgrade").send(body)).status, 401);
  });

  it("are limited per network", async () => {
    for (let i = 0; i < 10; i++) assert.equal((await api.post("/auth/guest")).status, 201);
    const limited = await api.post("/auth/guest");
    assert.equal(limited.status, 429);
    assert.match(limited.body.message, /Too many guest accounts/);
  });
});

describe("visitors who haven't logged in", () => {
  it("can chat and get a booking card, which they confirm after logging in", async () => {
    const admin = await createUser("ADMIN");
    const alice = await createUser();
    const { showtime } = await createShowtime(admin, { price: 10 });

    scriptedModel(
      ask("getMyBookings", {}),
      (request) => {
        assert.match(lastResults(request)[0].error, /isn't logged in/);
        return ask("proposeBooking", { showtime: String(showtime._id), seats: ["B1", "B2"] });
      },
      say("Press Confirm on the card.")
    );
    const first = await api.post("/agent/chat").send({ message: "Two seats please" });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const visitor = cookiesFrom(first);
    assert.match(visitor[0], /^seatora_visitor=/);
    assert.match(requests[0].systemInstruction, /isn't logged in/);
    const [card] = first.body.data.cards;
    assert.equal(card.totalCents, 2000);

    // Seen by the same browser, not by another one
    assert.equal((await api.get(`/agent/proposals/${card.proposal}`).set("Cookie", cookieHeader(visitor))).status, 200);
    assert.equal((await api.get(`/agent/proposals/${card.proposal}`)).status, 404);

    // Confirming needs a login; logging in moves the chat and the card
    assert.equal((await api.post(`/agent/proposals/${card.proposal}/confirm`).set("Cookie", cookieHeader(visitor))).status, 401);
    const login = await api
      .post("/auth/login")
      .set("Cookie", cookieHeader(visitor))
      .send({ email: alice.user.email, password: "password123" });
    assert.equal(login.status, 200);
    assert.ok((login.headers["set-cookie"] ?? []).some((c) => /^seatora_visitor=;/.test(c)), "visitor cookie cleared");
    assert.equal(String((await AgentProposal.findById(card.proposal)).user), String(alice.user._id));
    assert.equal(await AgentConversation.countDocuments({ user: alice.user._id }), 1);

    const confirmed = await api.post(`/agent/proposals/${card.proposal}/confirm`).set(alice.auth);
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.data.booking.status, "pending");

    const history = await api.get("/agent/chat").set(alice.auth);
    assert.deepEqual(history.body.data.messages.map((m) => m.text), ["Two seats please", "Press Confirm on the card."]);
  });

  it("can continue as a guest from the card and confirm it", async () => {
    const admin = await createUser("ADMIN");
    const { showtime } = await createShowtime(admin);
    scriptedModel(ask("proposeBooking", { showtime: String(showtime._id), seats: ["C1"] }), say("Here you go."));
    const chat = await api.post("/agent/chat").send({ message: "One seat" });
    const [card] = chat.body.data.cards;

    const guest = await api.post("/auth/guest").set("Cookie", cookieHeader(cookiesFrom(chat)));
    const session = cookiesFrom(guest).filter((c) => c.startsWith("seatora_session="));
    const confirmed = await api.post(`/agent/proposals/${card.proposal}/confirm`).set("Cookie", cookieHeader(session));
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(String(confirmed.body.data.booking.user), guest.body.data.user._id);
  });

  it("are limited to fewer messages per network than users", async () => {
    scriptedModel(...Array.from({ length: 11 }, () => say("Hi")));
    for (let i = 0; i < 10; i++) assert.equal((await api.post("/agent/chat").send({ message: "Hi" })).status, 200);
    const limited = await api.post("/agent/chat").send({ message: "Hi" });
    assert.equal(limited.status, 429);
    assert.match(limited.body.message, /continue as a guest/);
  });
});
