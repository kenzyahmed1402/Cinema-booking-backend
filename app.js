import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import MoviesRouter from "./routes/movieRouter.js";
import cinemaRouter from "./routes/cinemaRouter.js";
import ScreenRouter from "./routes/screensRouter.js";
import STRouter from "./routes/showTimeRouter.js";
import bookingRouter from "./routes/bookingRouter.js";
import authRouter from "./routes/authRouter.js";
import paymentRouter from "./routes/paymentRouter.js";
import { handlePayPalWebhook } from "./controllers/webhookController.js";
import errorHandler from "./middlewares/errorHandler.js";
import { createApiLimiter } from "./middlewares/rateLimit.js";
import AppError from "./utils/AppError.js";

// The Express app without a database connection or port, so tests can use it
const app = express();

// Number of proxies in front of the app (e.g. 1 on Render or Heroku), so
// rate limiting sees the real client IP. 0 when running directly.
app.set("trust proxy", Number(process.env.TRUST_PROXY) || 0);

// Standard security headers
app.use(helmet());

// For the hosting platform's health checks. Before CORS and the rate limit,
// so frequent checks are never blocked. Reports only whether the app and its
// database connection are up.
app.get("/health", (req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({
        status: connected ? "ok" : "error",
        database: connected ? "connected" : "disconnected",
    });
});

// CORS_ORIGIN: comma-separated frontend URLs allowed to call the API from a
// browser, e.g. http://localhost:5173. Not set: any origin is allowed.
const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));

// At most API_RATE_LIMIT requests per IP per 15 minutes across the API
app.use(createApiLimiter(Number(process.env.API_RATE_LIMIT) || 300));

// PayPal's webhook needs the body exactly as sent (its signature covers it),
// so it gets the raw bytes, with a small size limit, before JSON parsing
app.post("/payments/webhook", express.raw({ type: "application/json", limit: "64kb" }), handlePayPalWebhook);

app.use(express.json());
app.use('/movies',MoviesRouter);
app.use('/cinemas',cinemaRouter);
app.use('/screens',ScreenRouter);
app.use('/showTimes',STRouter);
app.use('/bookings',bookingRouter);
app.use('/auth',authRouter);
app.use('/payments', paymentRouter);

app.use((req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

app.use(errorHandler);

export default app;
