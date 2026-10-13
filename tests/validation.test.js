import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Movie from "../models/movies.js";
import { api, created, createUser, useTestDatabase } from "./helpers.js";

useTestDatabase();

const newMovie = async (admin) =>
  created(await api.post("/movies").set(admin.auth).send({ title: "Movie", genre: "Drama", duration: 100 }));

describe("updates (PUT)", () => {
  it("accept only the fields being changed", async () => {
    const admin = await createUser("ADMIN");
    const movie = await newMovie(admin);
    const res = await api.put(`/movies/${movie._id}`).set(admin.auth).send({ title: "Renamed" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.movie.title, "Renamed");
    assert.equal(res.body.data.movie.genre, "Drama");
    assert.equal(res.body.data.movie.duration, 100);
  });

  it("reject an empty update, a missing body and blanking a required field", async () => {
    const admin = await createUser("ADMIN");
    const movie = await newMovie(admin);
    assert.equal((await api.put(`/movies/${movie._id}`).set(admin.auth).send({})).status, 400);
    assert.equal((await api.put(`/movies/${movie._id}`).set(admin.auth)).status, 400);
    const blank = await api.put(`/movies/${movie._id}`).set(admin.auth).send({ title: "" });
    assert.equal(blank.status, 400);
    assert.equal(blank.body.message, "title cannot be empty");
  });

  it("still check the rules for the fields that are sent", async () => {
    const admin = await createUser("ADMIN");
    const movie = await newMovie(admin);
    assert.equal((await api.put(`/movies/${movie._id}`).set(admin.auth).send({ genre: "Opera" })).status, 400);
  });
});

describe("request fields", () => {
  it("that an endpoint doesn't accept are ignored, including _id", async () => {
    const admin = await createUser("ADMIN");
    const chosenId = "65a0000000000000000000ff";
    const res = await api.post("/movies").set(admin.auth).send({ _id: chosenId, title: "M", genre: "Drama", duration: 90 });
    assert.equal(res.status, 201);
    assert.notEqual(res.body.data.movie._id, chosenId);

    const update = await api.put(`/movies/${res.body.data.movie._id}`).set(admin.auth).send({ _id: chosenId, title: "N" });
    assert.equal(update.status, 200);
    assert.equal(update.body.data.movie._id, res.body.data.movie._id);
  });
});

describe("error responses", () => {
  it("return 400 for model validation errors and invalid IDs", async () => {
    const admin = await createUser("ADMIN");
    const longTitle = await api.post("/movies").set(admin.auth).send({ title: "T".repeat(201), genre: "Drama", duration: 90 });
    assert.equal(longTitle.status, 400);
    assert.match(longTitle.body.message, /cannot exceed 200 characters/);
    assert.equal((await api.get("/movies/not-an-id")).status, 400);
  });

  it("return 400 for a malformed JSON body", async () => {
    const admin = await createUser("ADMIN");
    const res = await api.post("/movies").set(admin.auth).set("Content-Type", "application/json").send('{"title": "broken');
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Request body is not valid JSON");
  });

  it("return 404 for unknown routes", async () => {
    assert.equal((await api.get("/nothing-here")).status, 404);
  });

  it("don't include internal details unless NODE_ENV is development", async () => {
    const admin = await createUser("ADMIN");
    const res = await api.post("/movies").set(admin.auth).send({ title: "T".repeat(201), genre: "Drama", duration: 90 });
    assert.equal(res.status, 400);
    assert.equal(res.body.stack, undefined);
    assert.equal(res.body.error, undefined);
  });

  it("include the stack trace when NODE_ENV is development", async (t) => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    t.after(() => { process.env.NODE_ENV = previous; });

    const res = await api.get("/movies/not-an-id");
    assert.equal(res.status, 400);
    assert.ok(res.body.stack);
  });

  it("hide the cause of unexpected errors", async (t) => {
    t.mock.method(Movie, "find", () => {
      throw new Error("connection string mongodb://secret-host failed");
    });
    const res = await api.get("/movies");
    assert.equal(res.status, 500);
    assert.equal(res.body.message, "Something went wrong");
    assert.doesNotMatch(JSON.stringify(res.body), /secret-host/);
  });

  it("keep 413 for a request body that is too large", async () => {
    const res = await api.post("/auth/login").send({ email: "a@example.com", password: "x".repeat(200000) });
    assert.equal(res.status, 413);
  });
});
