import mongoose from 'mongoose';

// How long a conversation is kept after its last message
export const CONVERSATION_HOURS = 24;

// One customer's conversation with the assistant, kept on the server so the
// browser only ever sends new messages and can't forge earlier turns or tool
// results.
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
      required: true,
      unique: true,
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
  }
);

const AgentConversation = mongoose.model('AgentConversation', agentConversationSchema);

export default AgentConversation;
