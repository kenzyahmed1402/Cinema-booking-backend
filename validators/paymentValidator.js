import validateRequest from "../middlewares/validateRequest.js";
import { ORDER_ID_PATTERN } from "../services/paypalService.js";

// Only the booking: the amount and currency always come from the server
const orderSchema = {
  booking: { required: true, type: "ObjectId" },
};

const captureSchema = {
  orderId: { required: true, type: "string", maxLength: 36, pattern: ORDER_ID_PATTERN },
};

export const validateOrder = validateRequest(orderSchema);
export const validateCapture = validateRequest(captureSchema);
