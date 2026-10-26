import catchAsync from "../utils/catchAsync.js";
import { confirmProposal, findProposal } from "../services/proposalService.js";
import { chat, chatHistory, clearChat } from "../services/agentChat.js";

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

// POST /agent/chat { message }: one message to the assistant. Answers its
// reply and any cards (booking or cancellation proposals) to show.
export const sendMessage = catchAsync(async (req, res) => {
  const { reply, cards } = await chat(req.user, req.body.message.trim());
  res.json({ status: "success", data: { reply, cards } });
});

// GET /agent/chat: the conversation so far, as shown on screen
export const getChat = catchAsync(async (req, res) => {
  res.json({ status: "success", data: { messages: await chatHistory(req.user) } });
});

// DELETE /agent/chat: starts a new conversation
export const deleteChat = catchAsync(async (req, res) => {
  await clearChat(req.user);
  res.status(204).send();
});
