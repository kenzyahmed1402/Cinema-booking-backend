import validateRequest from "../middlewares/validateRequest.js";

const bookingSchema = {
  showtime: { required: true, type: "ObjectId" },
  customerName: { required: true, type: "string" },
  customerEmail: { required: true, type: "email" },
  seats: { required: true, type: "array", minLength: 1, arrayItemType: "string" },
  totalPrice: { required: true, type: "number", min: 0 },
  status: { type: "string", enum: ["pending", "confirmed", "cancelled"] },
};

export const validateBooking = validateRequest(bookingSchema);
