import validateRequest from "../middlewares/validateRequest.js";
import AppError from "../utils/AppError.js";
import { MAX_SEATS, seatPattern } from "../models/Booking.js";

const seatsRule = {
  required: true,
  type: "array",
  minLength: 1,
  maxLength: MAX_SEATS,
  arrayItemType: "string",
  arrayItemPattern: seatPattern,
  uniqueItems: true,
};

// Creating a booking: the user, customer name and email come from the
// logged-in account, totalPrice is calculated and status starts as pending
const bookingSchema = {
  showtime: { required: true, type: "ObjectId" },
  seats: seatsRule,
};

// Admins can change these. Status can only be set to cancelled: confirmed,
// refunded and expired are set by the payment flow and hold expiry, never by
// a request. The controller checks which changes the booking's state allows.
const bookingUpdateSchema = {
  showtime: { required: true, type: "ObjectId" },
  customerName: { required: true, type: "string", maxLength: 100 },
  customerEmail: { required: true, type: "email", maxLength: 254 },
  seats: seatsRule,
  status: { type: "string", enum: ["cancelled"] },
};

// Customers can only cancel their own booking
const bookingCancelSchema = {
  status: { required: true, type: "string", enum: ["cancelled"] },
};

export const validateBooking = validateRequest(bookingSchema);
export const validateBookingUpdate = validateRequest(bookingUpdateSchema, { partial: true });
export const validateBookingCancel = validateRequest(bookingCancelSchema);

// Picks the update rules for the logged-in user's role (runs after protect)
export const validateBookingUpdateForRole = (req, res, next) => {
  if (req.user.role === "ADMIN") {
    return validateBookingUpdate(req, res, next);
  }
  validateBookingCancel(req, res, (err) =>
    next(err && new AppError('You can only cancel your booking: send { "status": "cancelled" }', 400))
  );
};
