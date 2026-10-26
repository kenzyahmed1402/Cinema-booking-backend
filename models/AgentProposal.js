import mongoose from 'mongoose';

// How long a proposal card can be confirmed
export const PROPOSAL_MINUTES = 15;

// A booking or cancellation the assistant proposed, waiting for the customer
// to click Confirm. Creating one changes nothing: confirming re-checks seats,
// price or refund on the server before anything happens. The card is what
// the customer sees, built from server data, never from the model's text.
//
// open: can be confirmed; confirming: a confirm is in progress;
// confirmed: done (`result` is the booking it made or cancelled)
const agentProposalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    kind: {
      type: String,
      enum: ['booking', 'cancellation'],
      required: true,
    },
    status: {
      type: String,
      enum: ['open', 'confirming', 'confirmed'],
      default: 'open',
    },
    // Booking proposals: the showtime, seats and total the card showed
    showtime: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Showtime',
    },
    seats: {
      type: [String],
      default: undefined,
    },
    totalCents: {
      type: Number,
    },
    // Cancellation proposals: the paid booking and the refund the card showed
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
    refundCents: {
      type: Number,
    },
    card: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    result: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
    // MongoDB deletes the proposal after this (TTL index)
    expiresAt: {
      type: Date,
      required: true,
      expires: 0,
    },
  },
  {
    timestamps: true,
  }
);

const AgentProposal = mongoose.model('AgentProposal', agentProposalSchema);

export default AgentProposal;
