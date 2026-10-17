import express from "express";
import { capturePayment, createOrder, getPaymentById } from "../controllers/paymentController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateCapture, validateOrder } from "../validators/paymentValidator.js";
import { protect } from "../middlewares/auth.js";
import { expireOverdueHolds } from "../utils/bookingHolds.js";

const paymentRouter = express.Router();

// Every payment route needs a login, and sees holds that ran out as expired
paymentRouter.use(protect, expireOverdueHolds);

paymentRouter.post("/orders", validateOrder, createOrder);
paymentRouter.post("/capture", validateCapture, capturePayment);
paymentRouter.get("/:id", validateObjectId(), getPaymentById);

export default paymentRouter;
