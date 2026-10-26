import Booking from "../models/Booking.js";
import AgentProposal from "../models/AgentProposal.js";
import AppError from "../utils/AppError.js";
import { cancelPaidBooking, formatCents, holdSeats, quoteSeats } from "./bookingService.js";

// Confirming a card the assistant proposed: the customer's click. Everything
// is checked again here, against the database, before seats are held or a
// refund is requested; the card's numbers are only what the customer agreed to.

// The user's own proposal; someone else's looks "not found"
export const findProposal = async (user, id) => {
  const proposal = await AgentProposal.findOne({ _id: id, user: user._id });
  if (!proposal) {
    throw new AppError("Proposal not found", 404);
  }
  return proposal;
};

const confirmedResult = async (proposal) => ({
  proposal,
  booking: await Booking.findById(proposal.result),
});

// Holds the seats of a booking proposal, if they are still free at the price
// the card showed
const confirmBooking = async (user, proposal) => {
  const quote = await quoteSeats({ showtime: proposal.showtime, seats: proposal.seats });
  if (quote.totalCents !== proposal.totalCents) {
    throw new AppError(
      `The price is now ${formatCents(quote.totalCents)} instead of ${formatCents(proposal.totalCents)}. ` +
        "Nothing was booked; ask the assistant for a new proposal.",
      409
    );
  }
  return holdSeats(user, { showtime: proposal.showtime, seats: proposal.seats });
};

// Cancels the paid booking of a cancellation proposal, only for the refund
// the card showed
const confirmCancellation = async (user, proposal) => {
  const { booking } = await cancelPaidBooking(user, proposal.booking, { expectedRefundCents: proposal.refundCents });
  return booking;
};

// Confirms a proposal once. Confirming it again returns what the first
// confirm did, so a double click can't book or refund twice.
export const confirmProposal = async (user, id) => {
  const proposal = await findProposal(user, id);
  if (proposal.status === "confirmed") {
    return confirmedResult(proposal);
  }
  if (proposal.expiresAt <= new Date()) {
    throw new AppError("This proposal has expired; ask the assistant for a new one", 410);
  }

  // Only one confirm at a time: claim the proposal while it is open
  const claimed = await AgentProposal.findOneAndUpdate(
    { _id: proposal._id, status: "open" },
    { status: "confirming" },
    { returnDocument: "after" }
  );
  if (!claimed) {
    const current = await AgentProposal.findById(proposal._id);
    if (current?.status === "confirmed") {
      return confirmedResult(current);
    }
    throw new AppError("This proposal is already being confirmed", 409);
  }

  let booking;
  try {
    booking = proposal.kind === "booking" ? await confirmBooking(user, claimed) : await confirmCancellation(user, claimed);
  } catch (err) {
    // Nothing happened, so it can be tried again (e.g. after a PayPal error)
    await AgentProposal.updateOne({ _id: proposal._id, status: "confirming" }, { status: "open" });
    throw err;
  }

  const done = await AgentProposal.findOneAndUpdate(
    { _id: proposal._id },
    { status: "confirmed", result: booking._id },
    { returnDocument: "after" }
  );
  return { proposal: done, booking };
};
