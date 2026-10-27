import express from "express";
import {
  confirmProposalHandler,
  deleteChat,
  getChat,
  getProposal,
  sendMessage,
} from "../controllers/agentController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { identify, protect } from "../middlewares/auth.js";
import { expireOverdueHolds } from "../utils/bookingHolds.js";
import { chatLimiter } from "../middlewares/rateLimit.js";
import { validateChat } from "../validators/agentValidator.js";

const agentRouter = express.Router();

// Every assistant route sees holds that ran out as expired. Chatting and
// viewing cards are open to visitors; confirming a card needs a login.
agentRouter.use(expireOverdueHolds);

agentRouter.post("/chat", identify, chatLimiter, validateChat, sendMessage);
agentRouter.get("/chat", identify, getChat);
agentRouter.delete("/chat", identify, deleteChat);
agentRouter.get("/proposals/:id", identify, validateObjectId(), getProposal);
agentRouter.post("/proposals/:id/confirm", protect, validateObjectId(), confirmProposalHandler);

export default agentRouter;
