import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { PAYPAL_CURRENCY, getPayPalClient, paypalFailure } from "../services/paypalService.js";
import { refundPayment } from "../services/refundService.js";
import { applyCapture } from "../services/captureService.js";
import { releaseSeats } from "../utils/showtimeSeats.js";

const MINUTE = 60 * 1000;
// Time a capture gets to finish: the hold is stretched to at least this long
// before PayPal is asked to take the money, so it can't run out mid-capture
const CAPTURE_GRACE_MS = 2 * MINUTE;

const toCents = (dollars) => Math.round(dollars * 100);

// Customers can only reach their own payments; admins can reach all of them.
// Someone else's payment looks "not found".
const accessFilter = (req) => (req.user.role === "ADMIN" ? {} : { user: req.user._id });

const DECLINED = "PayPal could not complete the payment. Please try another payment method.";

const sendPayment = (res, statusCode, payment, booking) =>
  res.status(statusCode).json({
    status: "success",
    data: { payment, ...(booking && { booking }) },
  });

// POST /payments/orders { booking }: starts PayPal checkout for the logged-in
// customer's own unpaid booking. The amount always comes from the booking.
// Asking again for the same booking returns the same order.
export const createOrder = catchAsync(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.body.booking, user: req.user._id });
  if (!booking) {
    throw new AppError("Booking not found", 404);
  }
  if (booking.status !== "pending") {
    throw new AppError(`A ${booking.status} booking can't be paid`, 409);
  }
  if (!booking.holdExpiresAt || booking.holdExpiresAt <= new Date()) {
    throw new AppError("The seat hold has run out. Please book again.", 409);
  }

  const open = await Payment.findOne({ booking: booking._id, status: "created" });
  if (open) {
    return sendPayment(res, 200, open);
  }

  const amountCents = toCents(booking.totalPrice);
  let order;
  try {
    // The request ID makes PayPal return the same order if this is repeated
    order = await getPayPalClient().createOrder({
      amountCents,
      currency: PAYPAL_CURRENCY,
      bookingId: booking._id,
      requestId: `order-${booking._id}`,
    });
  } catch (err) {
    throw paypalFailure(err, DECLINED);
  }

  try {
    const payment = await Payment.create({
      booking: booking._id,
      user: req.user._id,
      paypalOrderId: order.orderId,
      amountCents,
      currency: PAYPAL_CURRENCY,
    });
    return sendPayment(res, 201, payment);
  } catch (err) {
    // A simultaneous request for the same booking recorded this order first
    const same = err.code === 11000 && (await Payment.findOne({ paypalOrderId: order.orderId, booking: booking._id }));
    if (same) {
      return sendPayment(res, 200, same);
    }
    throw err;
  }
});

// POST /payments/capture { orderId }: called after the customer approved the
// payment in PayPal. The booking is confirmed only after PayPal reports a
// completed capture of exactly the expected amount, currency and booking.
export const capturePayment = catchAsync(async (req, res) => {
  const payment = await Payment.findOne({ paypalOrderId: req.body.orderId, user: req.user._id });
  if (!payment) {
    throw new AppError("Payment not found", 404);
  }
  // Repeating a capture that already succeeded changes nothing
  if (payment.status === "captured") {
    return sendPayment(res, 200, payment, await Booking.findById(payment.booking));
  }
  if (payment.status !== "created") {
    throw new AppError(`This payment is ${payment.status}`, 409);
  }

  // Before any money moves: the booking must still be waiting for payment
  // with time left on its hold, which is stretched so it can't run out
  // while PayPal works. One conditional update, so nothing can slip in.
  const now = new Date();
  const held = await Booking.findOneAndUpdate(
    { _id: payment.booking, status: "pending", holdExpiresAt: { $gt: now } },
    { $max: { holdExpiresAt: new Date(now.getTime() + CAPTURE_GRACE_MS) } },
    { returnDocument: "after" }
  );
  if (!held) {
    await Payment.updateOne({ _id: payment._id, status: "created" }, { status: "failed" });
    throw new AppError("The seat hold has run out, so the payment wasn't taken. Please book again.", 409);
  }

  let result;
  try {
    result = await getPayPalClient().captureOrder(payment.paypalOrderId, {
      requestId: `capture-${payment.paypalOrderId}`,
    });
  } catch (err) {
    throw paypalFailure(err, DECLINED);
  }

  const { outcome, payment: recorded, booking } = await applyCapture(payment, result);
  if (outcome === "review") {
    throw new AppError("The payment couldn't be verified. It will be checked and refunded if needed.", 409);
  }
  if (outcome === "late_refunded") {
    throw new AppError("The booking changed while the payment was taken, so the payment was refunded.", 409);
  }
  if (outcome === "late_review") {
    throw new AppError("The booking changed while the payment was taken. It will be refunded.", 409);
  }
  return sendPayment(res, 200, recorded, booking);
});

// GET /payments/:id: a payment and its status
export const getPaymentById = catchAsync(async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, ...accessFilter(req) });
  if (!payment) {
    throw new AppError("Payment not found", 404);
  }
  return sendPayment(res, 200, payment);
});

// POST /payments/:id/refund (admin): refunds a needs_review payment in full,
// e.g. one PayPal reported differently than expected. Its booking, if still
// held for review, gives its seats back.
export const refundPaymentForReview = catchAsync(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) {
    throw new AppError("Payment not found", 404);
  }
  if (payment.status !== "needs_review") {
    throw new AppError(`Only payments in review are refunded here; this one is ${payment.status}`, 409);
  }

  const refunded = await refundPayment(payment, { fromStatus: "needs_review" });

  const booking = await Booking.findOneAndUpdate(
    { _id: payment.booking, status: "needs_review" },
    { status: "refunded" },
    { returnDocument: "after" }
  );
  if (booking) {
    await releaseSeats(booking.showtime, booking.seats);
  }

  return sendPayment(res, 200, refunded, booking ?? (await Booking.findById(payment.booking)));
});
