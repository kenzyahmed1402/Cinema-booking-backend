// Must be the first import: loads .env before any other module reads it
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import { findConfigProblems } from "./config/env.js";
import app from "./app.js";
import { startHoldSweeper } from "./utils/bookingHolds.js";

const configProblems = findConfigProblems(process.env);
if (configProblems.length > 0) {
    console.error(`Can't start the server, fix these in .env:\n- ${configProblems.join("\n- ")}`);
    console.error("Generate a JWT_SECRET with: openssl rand -hex 32");
    process.exit(1);
}

const PORT = process.env.PORT || 5050;

// Connect to the database before accepting requests
await connectDB();

// Gives the seats of unpaid bookings back once their hold runs out
startHoldSweeper();

const server = app.listen(PORT , ()=>{
    console.log(`Server running on port ${PORT}`);
});

// Hosting platforms stop the app with SIGTERM, e.g. on every deploy. Finish
// the requests in progress (such as a PayPal capture) before closing the
// database, and give up on any that take longer than 10 seconds.
process.once("SIGTERM", () => {
    console.log("SIGTERM received, shutting down");
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
    });
});
