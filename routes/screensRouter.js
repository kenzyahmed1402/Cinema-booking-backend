import express from "express";
import { createScreen, getScreens, getScreenById, updateScreen, deleteScreen } from "../controllers/screensController.js";

const ScreenRouter = express.Router();

ScreenRouter.get('/',getScreens);
ScreenRouter.get('/:id',getScreenById);
ScreenRouter.post('/',createScreen);
ScreenRouter.put('/:id',updateScreen);
ScreenRouter.delete('/:id',deleteScreen);

export default ScreenRouter;