// Must be the first import: loads .env before any other module reads it
import "dotenv/config";
import connectDB from "./config/db.js";
import { findConfigProblems } from "./config/env.js";
import app from "./app.js";

const configProblems = findConfigProblems(process.env);
if (configProblems.length > 0) {
    console.error(`Can't start the server, fix these in .env:\n- ${configProblems.join("\n- ")}`);
    console.error("Generate a JWT_SECRET with: openssl rand -hex 32");
    process.exit(1);
}

const PORT = process.env.PORT || 5050;

// Connect to the database before accepting requests
await connectDB();

app.listen(PORT , ()=>{
    console.log(`Server running on port ${PORT}`);
});
