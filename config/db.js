import mongoose from "mongoose";
import AppError from "../utils/AppError.js";

// Mongoose builds indexes in the background and silently ignores failures,
// e.g. a unique index that can't be built because duplicate data exists.
// Wait for every model's index build and report any that failed.
const checkIndexes = async () => {
    const models = Object.values(mongoose.models);
    const results = await Promise.allSettled(models.map((model) => model.init()));

    results.forEach((result, i) => {
        if (result.status === "rejected") {
            console.error(
                `INDEX ERROR (${models[i].modelName}): ${result.reason.message}`
            );
        }
    });
};

const connectDB = async () => {
    try{
       const conn = await mongoose.connect(process.env.MONGO_URI);
       console.log("MongoDB connected");
    }catch(error){
        // Only the message: a full error could include the connection string
        console.error(`MongoDB connection error: ${error.message}`);
        process.exit(1);
    }

    await checkIndexes();
};

let connecting;

// For serverless hosting (Vercel), where server.js doesn't run: connects on
// the first request and reuses the connection for later requests on the
// same instance. A failed attempt is retried by the next request.
export const connectOnce = () => {
    if (mongoose.connection.readyState === 1) {
        return Promise.resolve();
    }
    connecting ??= mongoose
        .connect(process.env.MONGO_URI, { maxPoolSize: 10 })
        .then(checkIndexes)
        .catch((error) => {
            connecting = undefined;
            // Only the message: a full error could include the connection string
            console.error(`MongoDB connection error: ${error.message}`);
            throw new AppError("The database is unavailable. Please try again shortly.", 503);
        });
    return connecting;
};

export default connectDB;
