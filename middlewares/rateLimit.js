import { rateLimit } from "express-rate-limit";
import AppError from "../utils/AppError.js";

// Limits failed login/register attempts per IP to slow down password
// guessing. Successful requests don't count, so normal users never hit it.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res, next) =>
    next(new AppError("Too many failed attempts. Please try again in 15 minutes.", 429)),
});
