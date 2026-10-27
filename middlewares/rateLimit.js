import { ipKeyGenerator, rateLimit } from "express-rate-limit";
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

// Limits new guest accounts per IP, so a script can't create thousands
export const guestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.GUEST_ACCOUNT_LIMIT) || 10,
  store: new MongoRateLimitStore("guest:"),
  passOnStoreError: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res, next) =>
    next(new AppError("Too many guest accounts from this network. Please try again later or create an account.", 429)),
});

// Limits messages to the assistant, on top of the daily cap for all users
// (AI_DAILY_REQUEST_CAP): per account for logged-in users, so it follows them
// across devices, and more strictly per IP for visitors, who could otherwise
// clear their cookie and start again.
export const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: (req) =>
    req.user ? Number(process.env.AI_USER_MESSAGE_LIMIT) || 30 : Number(process.env.AI_VISITOR_MESSAGE_LIMIT) || 10,
  keyGenerator: (req) => (req.user ? `user:${req.user._id}` : `ip:${ipKeyGenerator(req.ip)}`),
  store: new MongoRateLimitStore("chat:"),
  passOnStoreError: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res, next) =>
    next(
      new AppError(
        req.user
          ? "You've sent a lot of messages to the assistant. Please try again in an hour."
          : "You've sent a lot of messages to the assistant. Log in or continue as a guest to keep chatting.",
        429
      )
    ),
});
