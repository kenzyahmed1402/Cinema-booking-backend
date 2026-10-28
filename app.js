import express from "express";
import { fileURLToPath } from "node:url";
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
import agentRouter from "./routes/agentRouter.js";
import { handlePayPalWebhook } from "./controllers/webhookController.js";
import errorHandler from "./middlewares/errorHandler.js";
import { createApiLimiter } from "./middlewares/rateLimit.js";
import { connectOnce } from "./config/db.js";
import { findConfigProblems } from "./config/env.js";
import AppError from "./utils/AppError.js";

// The Express app without a database connection or port, so tests can use it
const app = express();

// Number of proxies in front of the app (e.g. 1 on Render or Heroku), so
// rate limiting sees the real client IP. 0 when running directly.
app.set("trust proxy", Number(process.env.TRUST_PROXY) || 0);

// Standard security headers, opened just enough for PayPal's checkout
// button: its script, the frames and images it shows, the calls it makes,
// and the popup window it opens (which has to report back to this page)
const PAYPAL_SOURCES = ["https://*.paypal.com", "https://*.paypalobjects.com"];
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                scriptSrc: ["'self'", ...PAYPAL_SOURCES],
                frameSrc: ["'self'", ...PAYPAL_SOURCES],
                connectSrc: ["'self'", ...PAYPAL_SOURCES],
                imgSrc: ["'self'", "data:", ...PAYPAL_SOURCES],
            },
        },
        crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    })
);

// The built web app (npm run build), with helmet's security headers. Served
// here on every host, Vercel included: the fixed path below lets Vercel's
// bundler include public/ with the app. Before the database connection and
// the rate limits, so pages load without either. Built files have content
// hashes in their names, so browsers may keep them for a year.
app.use(
    express.static(fileURLToPath(new URL("./public", import.meta.url)), {
        setHeaders: (res, filePath) => {
            if (filePath.includes("/assets/")) {
                res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            }
        },
    })
);

// On Vercel, server.js doesn't run: the settings are checked when the app
// loads and the database is connected on the first request. Seat holds
// still expire, because every route that reads or books seats expires
// overdue holds first.
if (process.env.VERCEL) {
    const problems = findConfigProblems(process.env);
    if (problems.length > 0) {
        throw new Error(`Can't start the app, fix these settings:\n- ${problems.join("\n- ")}`);
    }
    app.use((req, res, next) => connectOnce().then(() => next(), next));
}

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
app.use('/agent', agentRouter);

app.use((req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

app.use(errorHandler);

export default app;
