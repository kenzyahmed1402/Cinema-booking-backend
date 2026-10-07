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
import { protect, restrictTo } from "../middlewares/auth.js";

const bookingRouter = express.Router();

bookingRouter.get("/", protect, restrictTo("ADMIN"), getBookings);
bookingRouter.get("/:id", protect, restrictTo("ADMIN"), validateObjectId(), getBookingById);
bookingRouter.post("/", protect, validateBooking, createBooking);
bookingRouter.put("/:id", protect, restrictTo("ADMIN"), validateObjectId(), validateBooking, updateBooking);
bookingRouter.delete("/:id", protect, restrictTo("ADMIN"), validateObjectId(), deleteBooking);

export default bookingRouter;
