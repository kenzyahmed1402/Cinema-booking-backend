import express from "express";
import {
  createBooking,
  getBookingById,
  getBookings,
  updateBooking,
  deleteBooking,
} from "../controllers/bookingController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateBooking } from "../validators/bookingValidator.js";

const bookingRouter = express.Router();

bookingRouter.get("/", getBookings);
bookingRouter.get("/:id", validateObjectId(), getBookingById);
bookingRouter.post("/", validateBooking, createBooking);
bookingRouter.put("/:id", validateObjectId(), validateBooking, updateBooking);
bookingRouter.delete("/:id", validateObjectId(), deleteBooking);

export default bookingRouter;
