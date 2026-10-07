import dotenv from "dotenv";
dotenv.config();
import express from "express";
import connectDB from "./config/db.js";
import MoviesRouter from "./routes/movieRouter.js";
import cinemaRouter from "./routes/cinemaRouter.js";
import ScreenRouter from "./routes/screensRouter.js";
import STRouter from "./routes/showTimeRouter.js";
import bookingRouter from "./routes/bookingRouter.js";
import authRouter from "./routes/authRouter.js";
import errorHandler from "./middlewares/errorHandler.js";
import AppError from "./utils/AppError.js";

connectDB();
const app = express();
app.use(express.json());
app.use('/movies',MoviesRouter);
app.use('/cinemas',cinemaRouter);
app.use('/screens',ScreenRouter);
app.use('/showTimes',STRouter);
app.use('/bookings',bookingRouter);
app.use('/auth',authRouter);

app.use((req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

app.use(errorHandler);

const PORT = process.env.PORT || 5050;

app.listen(PORT , ()=>{
    console.log("Server is running");
});



