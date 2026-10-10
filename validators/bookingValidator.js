import validateRequest from "../middlewares/validateRequest.js";
import { seatPattern } from "../models/Booking.js";

const bookingSchema = {
  showtime: { required: true, type: "ObjectId" },
  customerName: { required: true, type: "string" },
  customerEmail: { required: true, type: "email" },
  seats: {
    required: true,
    type: "array",
    minLength: 1,
    arrayItemType: "string",
    arrayItemPattern: seatPattern,
    uniqueItems: true,
  },
  // totalPrice is not accepted from the client; the server calculates it
  status: { type: "string", enum: ["pending", "confirmed", "cancelled"] },
};

export const validateBooking = validateRequest(bookingSchema);
export const validateBookingUpdate = validateRequest(bookingSchema, { partial: true });
