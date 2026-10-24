import Payment from "../models/Payment.js";
import AppError from "../utils/AppError.js";
import { getPayPalClient, paypalFailure } from "./paypalService.js";

const REFUSED = "PayPal refused the refund. It will be checked by the cinema.";

// Refunds a payment through PayPal: `refundCents` of it, or all of it when
// left out. The payment must currently be in `fromStatus`; claiming it for
// the refund is one conditional update, so two requests can never refund the
// same payment. The PayPal request ID is tied to the capture, so a retry
// returns the first refund instead of paying out twice.
//
// Resolves to the updated payment: "refunded" once PayPal reports the refund
// completed, still "refund_pending" while PayPal is processing it. If PayPal
// fails, the payment goes back to `fromStatus` and nothing counts as refunded.
export const refundPayment = async (payment, { fromStatus, refundCents }) => {
  if (!payment.captureId) {
    throw new AppError("This payment has no capture to refund", 409);
  }

  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: fromStatus },
    { status: "refund_pending", refundCents: refundCents ?? payment.amountCents },
    { returnDocument: "after" }
  );
  if (!claimed) {
    throw new AppError("This payment is already being refunded or has changed", 409);
  }

  let refund;
  try {
    refund = await getPayPalClient().refundCapture(claimed.captureId, {
      amountCents: refundCents,
      currency: claimed.currency,
      requestId: `refund-${claimed.captureId}`,
    });
  } catch (err) {
    await Payment.updateOne(
      { _id: claimed._id, status: "refund_pending" },
      { status: fromStatus, $unset: { refundCents: 1 } }
    );
    throw paypalFailure(err, REFUSED);
  }

  return Payment.findOneAndUpdate(
    { _id: claimed._id, status: "refund_pending" },
    { refundId: refund.refundId, ...(refund.status === "COMPLETED" && { status: "refunded" }) },
    { returnDocument: "after" }
  );
};
