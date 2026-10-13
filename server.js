import dotenv from "dotenv";
dotenv.config();
import connectDB from "./config/db.js";
import app from "./app.js";

const PORT = process.env.PORT || 5050;

// Connect to the database before accepting requests
await connectDB();

app.listen(PORT , ()=>{
    console.log(`Server running on port ${PORT}`);
});
