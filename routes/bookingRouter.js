import express from "express";
import {
  createBooking,
  getBookingById,
  getBookings,
  updateBooking,
  deleteBooking,
  getCancellationQuote,
  cancelPaidBooking,
} from "../controllers/bookingController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateBooking, validateBookingUpdateForRole, validatePaidCancel } from "../validators/bookingValidator.js";
import { protect, restrictTo } from "../middlewares/auth.js";
import { expireOverdueHolds } from "../utils/bookingHolds.js";

const bookingRouter = express.Router();

// Every booking route needs a login. Bookings and seats are then always
// shown with overdue holds already expired.
bookingRouter.use(protect, expireOverdueHolds);

// Customers only see and cancel their own bookings (enforced in the
// controller); admins can see and change all of them
bookingRouter.get("/", getBookings);
bookingRouter.get("/:id", validateObjectId(), getBookingById);
bookingRouter.post("/", validateBooking, createBooking);
bookingRouter.put("/:id", validateObjectId(), validateBookingUpdateForRole, updateBooking);
bookingRouter.delete("/:id", restrictTo("ADMIN"), validateObjectId(), deleteBooking);
// Paid bookings are cancelled with a refund under the cancellation policy
bookingRouter.get("/:id/cancellation-quote", validateObjectId(), getCancellationQuote);
bookingRouter.post("/:id/cancel", validateObjectId(), validatePaidCancel, cancelPaidBooking);

export default bookingRouter;
