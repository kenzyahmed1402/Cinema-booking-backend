import validateRequest from "../middlewares/validateRequest.js";

// Only the new message: the conversation itself is kept on the server
const chatSchema = {
  message: { required: true, type: "string", maxLength: 1000, pattern: /\S/ },
};

export const validateChat = validateRequest(chatSchema);
