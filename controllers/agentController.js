import catchAsync from "../utils/catchAsync.js";
import { confirmProposal, findProposal } from "../services/proposalService.js";

// What the web app needs to show a proposal card and its state
const proposalView = (proposal) => ({
  id: proposal._id,
  kind: proposal.kind,
  status: proposal.status,
  card: proposal.card,
  expiresAt: proposal.expiresAt,
  result: proposal.result,
});

// GET /agent/proposals/:id: one of the user's own proposal cards
export const getProposal = catchAsync(async (req, res) => {
  const proposal = await findProposal(req.user, req.params.id);
  res.json({ status: "success", data: { proposal: proposalView(proposal) } });
});

// POST /agent/proposals/:id/confirm: the customer's click on a card. A booking
// card holds the seats (pay next with POST /payments/orders); a cancellation
// card cancels the paid booking with its refund.
export const confirmProposalHandler = catchAsync(async (req, res) => {
  const { proposal, booking } = await confirmProposal(req.user, req.params.id);
  res.json({ status: "success", data: { proposal: proposalView(proposal), booking } });
});
