import express from "express";
import {
  capturePayment,
  createOrder,
  getPaymentById,
  getPaymentConfig,
  refundPaymentForReview,
} from "../controllers/paymentController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateCapture, validateOrder } from "../validators/paymentValidator.js";
import { protect, restrictTo } from "../middlewares/auth.js";
import { expireOverdueHolds } from "../utils/bookingHolds.js";

const paymentRouter = express.Router();

// The public PayPal client ID, for the checkout button
paymentRouter.get("/config", getPaymentConfig);

// Every other payment route needs a login, and sees holds that ran out as
// expired
paymentRouter.use(protect, expireOverdueHolds);

paymentRouter.post("/orders", validateOrder, createOrder);
paymentRouter.post("/capture", validateCapture, capturePayment);
paymentRouter.get("/:id", validateObjectId(), getPaymentById);
paymentRouter.post("/:id/refund", restrictTo("ADMIN"), validateObjectId(), refundPaymentForReview);

export default paymentRouter;
