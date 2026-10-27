import AgentConversation from "../models/AgentConversation.js";
import AgentProposal from "../models/AgentProposal.js";

// When a visitor logs in, registers or continues as a guest, their chat with
// the assistant and its cards move to the account, so they can confirm the
// booking they just discussed. Their current chat replaces any older one.
export const claimVisitorData = async (visitor, userId) => {
  if (!visitor) return;
  await AgentProposal.updateMany(
    { visitor, user: { $exists: false } },
    { $set: { user: userId }, $unset: { visitor: 1 } }
  );
  if (await AgentConversation.exists({ visitor })) {
    await AgentConversation.deleteOne({ user: userId });
    await AgentConversation.updateOne({ visitor }, { $set: { user: userId }, $unset: { visitor: 1 } });
  }
};
