import express from "express";
import MoviesRouter from "./routes/movieRouter.js";
import cinemaRouter from "./routes/cinemaRouter.js";
import ScreenRouter from "./routes/screensRouter.js";
import STRouter from "./routes/showTimeRouter.js";
import bookingRouter from "./routes/bookingRouter.js";
import authRouter from "./routes/authRouter.js";
import errorHandler from "./middlewares/errorHandler.js";
import AppError from "./utils/AppError.js";

// The Express app without a database connection or port, so tests can use it
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

export default app;
