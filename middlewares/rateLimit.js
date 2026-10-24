import { rateLimit } from "express-rate-limit";
import AppError from "../utils/AppError.js";
import { MongoRateLimitStore } from "../utils/rateLimitStore.js";

// The counts are kept in MongoDB, shared by every instance of the app. If the
// database can't be reached, requests are let through: nothing else works
// without it either, and blocking everyone would hide the real error.

// Limits all requests per IP, to slow down scraping and request floods.
// The limit is passed in so tests can use a small one.
export const createApiLimiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    store: new MongoRateLimitStore("api:"),
    passOnStoreError: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new AppError("Too many requests. Please try again in 15 minutes.", 429)),
  });

// Limits failed login/register attempts per IP to slow down password
// guessing. Successful requests don't count, so normal users never hit it.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 10,
  skipSuccessfulRequests: true,
  store: new MongoRateLimitStore("auth:"),
  passOnStoreError: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res, next) =>
    next(new AppError("Too many failed attempts. Please try again in 15 minutes.", 429)),
});
