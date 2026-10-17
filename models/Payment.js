import mongoose from 'mongoose';

// created: a PayPal order exists for the booking, not paid yet
// captured: PayPal confirmed the money was taken
// failed: the capture was declined or the order was abandoned
// refund_pending / refunded: a refund was requested / completed
// needs_review: something doesn't add up (e.g. paid after the hold expired)
export const PAYMENT_STATUSES = ['created', 'captured', 'failed', 'refund_pending', 'refunded', 'needs_review'];

const paymentSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking reference is required'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Payment user is required'],
    },
    // The same PayPal order or capture can never be recorded twice, so a
    // repeated request or webhook can't confirm or refund a booking twice
    paypalOrderId: {
      type: String,
      required: [true, 'PayPal order ID is required'],
      unique: true,
    },
    captureId: {
      type: String,
    },
    // Whole cents, so amounts never have floating point leftovers
    amountCents: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1, 'Amount must be at least 1 cent'],
      validate: { validator: Number.isInteger, message: 'Amount must be whole cents' },
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      uppercase: true,
      match: [/^[A-Z]{3}$/, 'Currency must be a 3-letter code like USD'],
    },
    // Set once a refund was requested: PayPal's refund ID and the amount
    refundId: {
      type: String,
    },
    refundCents: {
      type: Number,
      min: [1, 'Refund must be at least 1 cent'],
      validate: { validator: Number.isInteger, message: 'Refund must be whole cents' },
    },
    status: {
      type: String,
      enum: {
        values: PAYMENT_STATUSES,
        message: `Status must be one of: ${PAYMENT_STATUSES.join(', ')}`,
      },
      default: 'created',
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ booking: 1 });
// Unique only once a capture exists; payments without one don't clash
paymentSchema.index(
  { captureId: 1 },
  { unique: true, partialFilterExpression: { captureId: { $type: 'string' } } }
);

paymentSchema.index(
  { refundId: 1 },
  { unique: true, partialFilterExpression: { refundId: { $type: 'string' } } }
);

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
