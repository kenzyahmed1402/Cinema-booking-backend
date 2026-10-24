import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import { refundPayment } from "./refundService.js";

// What PayPal reported that doesn't match the payment we expected, if anything
const captureProblems = (result, payment, { checkPayee }) => {
  const problems = [];
  if (result.orderStatus !== "COMPLETED" || result.captureStatus !== "COMPLETED") {
    problems.push(`status ${result.orderStatus}/${result.captureStatus}`);
  }
  if (result.amountCents !== payment.amountCents) problems.push("amount");
  if (result.currency !== payment.currency) problems.push("currency");
  if (result.bookingId !== String(payment.booking)) problems.push("booking");
  const merchantId = process.env.PAYPAL_MERCHANT_ID;
  if (checkPayee && merchantId && result.payeeMerchantId !== merchantId) problems.push("payee");
  return problems;
};

// Records a capture PayPal reported for a payment that was waiting for it
// ("created"), from the capture endpoint or a webhook. The booking is
// confirmed only for a completed capture of exactly the expected amount,
// currency and booking. Every change is conditional, so a capture reported
// twice (or by both the endpoint and a webhook) is applied once.
//
// Resolves to { outcome, payment, booking }, where outcome is one of:
//   confirmed      the booking is paid
//   already        it was already recorded; nothing changed
//   review         PayPal reported something unexpected; payment and booking
//                  are kept in needs_review (the booking keeps its seats)
//   late_refunded  the booking stopped waiting for payment meanwhile, so the
//                  money was refunded
//   late_review    as above, but the refund failed; the payment is in review
export const applyCapture = async (payment, result, { checkPayee = true } = {}) => {
  if (payment.status !== "created") {
    return { outcome: "already", payment, booking: await Booking.findById(payment.booking) };
  }

  const problems = captureProblems(result, payment, { checkPayee });
  if (problems.length > 0) {
    // Money may have moved, so nothing is released or confirmed
    console.error(`PayPal capture for order ${payment.paypalOrderId} needs review: ${problems.join(", ")}`);
    await Payment.updateOne(
      { _id: payment._id, status: "created" },
      { status: "needs_review", ...(result.captureId && { captureId: result.captureId }) }
    );
    await Booking.updateOne({ _id: payment.booking, status: "pending" }, { status: "needs_review" });
    return { outcome: "review", payment: await Payment.findById(payment._id), booking: await Booking.findById(payment.booking) };
  }

  const captured = await Payment.findOneAndUpdate(
    { _id: payment._id, status: "created" },
    { status: "captured", captureId: result.captureId },
    { returnDocument: "after" }
  );
  if (!captured) {
    // Recorded by a simultaneous request first
    return { outcome: "already", payment: await Payment.findById(payment._id), booking: await Booking.findById(payment.booking) };
  }

  const booking = await Booking.findOneAndUpdate(
    { _id: payment.booking, status: "pending" },
    { status: "confirmed" },
    { returnDocument: "after" }
  );
  if (booking) {
    return { outcome: "confirmed", payment: captured, booking };
  }

  // The booking stopped waiting for payment while PayPal was capturing, e.g.
  // it was cancelled or its hold ran out. The money goes straight back; if
  // that fails, the payment stays in needs_review for the cinema.
  await Payment.updateOne({ _id: payment._id }, { status: "needs_review" });
  try {
    const refunded = await refundPayment(captured, { fromStatus: "needs_review" });
    return { outcome: "late_refunded", payment: refunded, booking: await Booking.findById(payment.booking) };
  } catch (err) {
    console.error(`Automatic refund for order ${payment.paypalOrderId} failed: ${err.message}`);
    return { outcome: "late_review", payment: await Payment.findById(payment._id), booking: await Booking.findById(payment.booking) };
  }
};
