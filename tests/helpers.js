import { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import supertest from "supertest";

// Test settings. Set before the app loads, because some settings are read
// when it loads.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
// Tests send many requests from one IP; the general limit is tested separately
process.env.API_RATE_LIMIT = "100000";

const { default: app } = await import("../app.js");
const { default: User } = await import("../models/User.js");

export const api = supertest(app);

let mongo;

// Runs the calling test file against its own in-memory MongoDB, wiped
// before every test. The first run downloads a MongoDB binary (cached
// afterwards).
export const useTestDatabase = () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await mongoose.connection.syncIndexes();
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
};

let userCount = 0;

// Creates a user directly in the database and returns it with a login token
export const createUser = async (role = "CUSTOMER", name = role === "ADMIN" ? "Admin" : "Customer") => {
  userCount += 1;
  const user = await User.create({
    name,
    email: `user${userCount}@example.com`,
    password: "password123",
    role,
  });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  return { user, token, auth: { Authorization: `Bearer ${token}` } };
};

// Returns the created document from a 201 response, or fails with details
export const created = (res) => {
  if (res.status !== 201) {
    throw new Error(`${res.req.method} ${res.req.path} -> ${res.status} ${JSON.stringify(res.body)}`);
  }
  return Object.values(res.body.data)[0];
};

// Creates a cinema, screen, movie and showtime through the API as an admin
export const createShowtime = async (
  admin,
  {
    rows = 10,
    seatsPerRow = 12,
    duration = 120,
    price = 10,
    startTime = "2030-01-01T19:00:00.000Z",
  } = {}
) => {
  const cinema = created(
    await api.post("/cinemas").set(admin.auth).send({ name: "Cinema", location: "Town" })
  );
  const screen = created(
    await api.post("/screens").set(admin.auth).send({ screenNumber: 1, rows, seatsPerRow, cinema: cinema._id })
  );
  const movie = created(
    await api.post("/movies").set(admin.auth).send({ title: "Movie", genre: "Drama", duration })
  );
  const showtime = created(
    await api.post("/showTimes").set(admin.auth).send({ movie: movie._id, screen: screen._id, startTime, price })
  );
  return { cinema, screen, movie, showtime };
};

export const book = async (user, showtime, seats) =>
  created(await api.post("/bookings").set(user.auth).send({ showtime: showtime._id, seats }));

export const bookedSeats = async (showtime) => {
  const res = await api.get(`/showTimes/${showtime._id}`);
  return [...res.body.data.showtime.bookedSeats].sort();
};
