import express from "express";
import {
  confirmProposalHandler,
  deleteChat,
  getChat,
  getProposal,
  sendMessage,
} from "../controllers/agentController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { protect } from "../middlewares/auth.js";
import { expireOverdueHolds } from "../utils/bookingHolds.js";
import { chatLimiter } from "../middlewares/rateLimit.js";
import { validateChat } from "../validators/agentValidator.js";

const agentRouter = express.Router();

// Every assistant route needs a login, and sees holds that ran out as expired
agentRouter.use(protect, expireOverdueHolds);

agentRouter.post("/chat", chatLimiter, validateChat, sendMessage);
agentRouter.get("/chat", getChat);
agentRouter.delete("/chat", deleteChat);
agentRouter.get("/proposals/:id", validateObjectId(), getProposal);
agentRouter.post("/proposals/:id/confirm", validateObjectId(), confirmProposalHandler);

export default agentRouter;
