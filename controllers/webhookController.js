import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import WebhookEvent from "../models/WebhookEvent.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { PayPalError, getPayPalClient, valueToCents } from "../services/paypalService.js";
import { applyCapture } from "../services/captureService.js";

const SIGNATURE_HEADERS = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
];

// A capture event's resource in the shape applyCapture checks
const captureResult = (capture) => ({
  orderStatus: capture.status,
  captureStatus: capture.status,
  captureId: capture.id,
  bookingId: capture.custom_id,
  amountCents: capture.amount ? valueToCents(capture.amount.value) : undefined,
  currency: capture.amount?.currency_code,
});

const orderIdOf = (capture) => capture.supplementary_data?.related_ids?.order_id;

// A refund resource links "up" to the capture it refunded
const refundedCaptureIdOf = (refund) =>
  refund.links?.map((link) => /\/captures\/([A-Z0-9]+)/.exec(link.href)?.[1]).find(Boolean);

// Each handler only moves a payment forward from the state it expects, so
// events that arrive late or out of order can't undo anything.
const handlers = {
  // Normally the capture endpoint has recorded this already; the event
  // covers a capture the server took but never got to record
  "PAYMENT.CAPTURE.COMPLETED": async (capture) => {
    const payment = await Payment.findOne({ paypalOrderId: orderIdOf(capture) });
    if (!payment) return "unknown_payment";
    // The event is verified as coming from PayPal for this app's webhook, so
    // the payee is this app's account
    const { outcome } = await applyCapture(payment, captureResult(capture), { checkPayee: false });
    return outcome;
  },

  "PAYMENT.CAPTURE.DENIED": async (capture) => {
    const updated = await Payment.updateOne(
      { paypalOrderId: orderIdOf(capture), status: "created" },
      { status: "failed" }
    );
    return updated.modifiedCount ? "failed" : "no_change";
  },

  "PAYMENT.CAPTURE.REFUNDED": async (refund) => {
    const captureId = refundedCaptureIdOf(refund);
    const payment =
      (await Payment.findOne({ refundId: refund.id })) ?? (captureId && (await Payment.findOne({ captureId })));
    if (!payment) return "unknown_payment";

    // A refund this app asked for: it's complete now
    const finished = await Payment.updateOne(
      { _id: payment._id, status: "refund_pending" },
      { status: "refunded", refundId: refund.id }
    );
    if (finished.modifiedCount) return "refunded";

    // A refund made outside the app (e.g. in the PayPal dashboard): record
    // it, and hold the booking for the cinema to look at
    const outside = await Payment.updateOne(
      { _id: payment._id, status: "captured" },
      {
        status: "refunded",
        refundId: refund.id,
        ...(refund.amount && { refundCents: valueToCents(refund.amount.value) }),
      }
    );
    if (outside.modifiedCount) {
      await Booking.updateOne({ _id: payment.booking, status: "confirmed" }, { status: "needs_review" });
      return "refunded_outside_app";
    }
    return "no_change";
  },

  // The money was taken back (e.g. a dispute): the cinema has to look at it
  "PAYMENT.CAPTURE.REVERSED": async (capture) => {
    const payment = await Payment.findOne({ captureId: capture.id });
    if (!payment) return "unknown_payment";
    await Payment.updateOne({ _id: payment._id, status: { $in: ["captured", "refund_pending"] } }, { status: "needs_review" });
    await Booking.updateOne({ _id: payment.booking, status: "confirmed" }, { status: "needs_review" });
    return "review";
  },
};

// POST /payments/webhook: PayPal's notifications. Public, because PayPal
// calls it, so nothing happens until PayPal itself confirms the message's
// signature. Answers 200 once handled (or already handled before), so PayPal
// stops retrying; any other answer makes PayPal send it again later.
export const handlePayPalWebhook = catchAsync(async (req, res) => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new AppError("PayPal webhooks are not configured on this server", 503);
  }

  if (SIGNATURE_HEADERS.some((name) => !req.headers[name])) {
    throw new AppError("Missing PayPal signature headers", 400);
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new AppError("The webhook body is not valid JSON", 400);
  }
  if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.id !== "string" || !event.resource) {
    throw new AppError("The webhook body is not a PayPal event", 400);
  }

  let genuine;
  try {
    genuine = await getPayPalClient().verifyWebhookSignature({ headers: req.headers, rawBody, webhookId });
  } catch (err) {
    if (err instanceof PayPalError) {
      // PayPal will deliver the event again later
      throw new AppError("Couldn't verify the webhook with PayPal right now", 502);
    }
    throw err;
  }
  if (!genuine) {
    console.error(`Rejected a PayPal webhook with an invalid signature (event ${event.id})`);
    throw new AppError("Invalid webhook signature", 400);
  }

  if (await WebhookEvent.exists({ eventId: event.id })) {
    return res.json({ status: "success", data: { outcome: "duplicate" } });
  }

  const handle = handlers[event.event_type];
  const outcome = handle ? await handle(event.resource) : "ignored";

  // Recorded after handling, so an event whose handling failed is retried by
  // PayPal. Two deliveries handled at once are safe: every change above is
  // conditional and happens only once.
  await WebhookEvent.updateOne(
    { eventId: event.id },
    { $setOnInsert: { eventId: event.id, eventType: String(event.event_type), resourceId: event.resource.id, outcome } },
    { upsert: true }
  );

  res.json({ status: "success", data: { outcome } });
});
