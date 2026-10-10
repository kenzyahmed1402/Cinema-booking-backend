import express from "express";
import {
  createScreen,
  getScreens,
  getScreenById,
  updateScreen,
  deleteScreen,
} from "../controllers/screensController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateScreen, validateScreenUpdate } from "../validators/screenValidator.js";
import { protect, restrictTo } from "../middlewares/auth.js";

const ScreenRouter = express.Router();

ScreenRouter.get("/", getScreens);
ScreenRouter.get("/:id", validateObjectId(), getScreenById);
ScreenRouter.post("/", protect, restrictTo("ADMIN"), validateScreen, createScreen);
ScreenRouter.put("/:id", protect, restrictTo("ADMIN"), validateObjectId(), validateScreenUpdate, updateScreen);
ScreenRouter.delete("/:id", protect, restrictTo("ADMIN"), validateObjectId(), deleteScreen);

export default ScreenRouter;
