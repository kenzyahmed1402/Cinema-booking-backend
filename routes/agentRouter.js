import express from "express";
import { confirmProposalHandler, getProposal } from "../controllers/agentController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { protect } from "../middlewares/auth.js";
import { expireOverdueHolds } from "../utils/bookingHolds.js";

const agentRouter = express.Router();

// Every assistant route needs a login, and sees holds that ran out as expired
agentRouter.use(protect, expireOverdueHolds);

agentRouter.get("/proposals/:id", validateObjectId(), getProposal);
agentRouter.post("/proposals/:id/confirm", validateObjectId(), confirmProposalHandler);

export default agentRouter;
