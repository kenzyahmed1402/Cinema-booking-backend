import mongoose from 'mongoose';

// How long a conversation is kept after its last message
export const CONVERSATION_HOURS = 24;

// One conversation with the assistant, kept on the server so the browser
// only ever sends new messages and can't forge earlier turns or tool results.
// It belongs to a user, or to a visitor who hasn't logged in (their cookie's
// ID) until they log in and it moves to their account.
//   contents: the turns in the model's format, tool calls and results
//             included, stored as JSON text (tool arguments come from the
//             model and may hold keys MongoDB doesn't accept)
//   messages: what the chat shows: the customer's and assistant's text, and
//             the cards from tool results
const agentConversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      sparse: true,
    },
    visitor: {
      type: String,
      unique: true,
      sparse: true,
    },
    contents: {
      type: String,
      default: '[]',
    },
    messages: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    // MongoDB deletes the conversation after this (TTL index)
    expiresAt: {
      type: Date,
      required: true,
      expires: 0,
    },
  },
  {
    timestamps: true,
    // A new collection: the first one only allowed conversations of users
    collection: 'agentchats',
  }
);

const AgentConversation = mongoose.model('AgentConversation', agentConversationSchema);

export default AgentConversation;
