import express from "express";
import {
  createScreen,
  getScreens,
  getScreenById,
  updateScreen,
  deleteScreen,
} from "../controllers/screensController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateScreen } from "../validators/screenValidator.js";

const ScreenRouter = express.Router();

ScreenRouter.get("/", getScreens);
ScreenRouter.get("/:id", validateObjectId(), getScreenById);
ScreenRouter.post("/", validateScreen, createScreen);
ScreenRouter.put("/:id", validateObjectId(), validateScreen, updateScreen);
ScreenRouter.delete("/:id", validateObjectId(), deleteScreen);

export default ScreenRouter;
