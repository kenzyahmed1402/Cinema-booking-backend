import express from "express";
import { createBooking, getBookingById, getBookings, updateBooking, deleteBooking } from "../controllers/bookingController.js";

const bookingRouter = express.Router();

bookingRouter.get('/',getBookings);
bookingRouter.get('/:id',getBookingById);
bookingRouter.post('/',createBooking);
bookingRouter.put('/:id',updateBooking);
bookingRouter.delete('/:id',deleteBooking);

export default bookingRouter;