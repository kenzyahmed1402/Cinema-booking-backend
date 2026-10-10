import mongoose from "mongoose";

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
        console.error("connection error" , error);
        process.exit(1);
    }

    await checkIndexes();
};

export default connectDB;
