import express from "express";
import {
  createBooking,
  getBookingById,
  getBookings,
  updateBooking,
  deleteBooking,
} from "../controllers/bookingController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateBooking, validateBookingUpdateForRole } from "../validators/bookingValidator.js";
import { protect, restrictTo } from "../middlewares/auth.js";

const bookingRouter = express.Router();

// Customers only see and cancel their own bookings (enforced in the
// controller); admins can see and change all of them
bookingRouter.get("/", protect, getBookings);
bookingRouter.get("/:id", protect, validateObjectId(), getBookingById);
bookingRouter.post("/", protect, validateBooking, createBooking);
bookingRouter.put("/:id", protect, validateObjectId(), validateBookingUpdateForRole, updateBooking);
bookingRouter.delete("/:id", protect, restrictTo("ADMIN"), validateObjectId(), deleteBooking);

export default bookingRouter;
