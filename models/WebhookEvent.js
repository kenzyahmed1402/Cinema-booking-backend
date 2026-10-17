import mongoose from 'mongoose';

// PayPal webhook events already handled. PayPal can deliver the same event
// more than once; its ID is stored once so a repeat does nothing.
const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: [true, 'Event ID is required'],
      unique: true,
    },
    eventType: {
      type: String,
      required: [true, 'Event type is required'],
    },
    // The PayPal capture or refund the event was about
    resourceId: {
      type: String,
    },
    // What handling it did, e.g. "confirmed", "ignored"
    outcome: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);

export default WebhookEvent;
