import express from "express";
import {
  createShowtime,
  getShowtimes,
  getShowtimeById,
  updateShowtime,
  deleteShowtime,
} from "../controllers/showTimeController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateShowtime, validateShowtimeUpdate } from "../validators/showtimeValidator.js";
import { protect, restrictTo } from "../middlewares/auth.js";

const STRouter = express.Router();

STRouter.get("/", getShowtimes);
STRouter.get("/:id", validateObjectId(), getShowtimeById);
STRouter.post("/", protect, restrictTo("ADMIN"), validateShowtime, createShowtime);
STRouter.put("/:id", protect, restrictTo("ADMIN"), validateObjectId(), validateShowtimeUpdate, updateShowtime);
STRouter.delete("/:id", protect, restrictTo("ADMIN"), validateObjectId(), deleteShowtime);

export default STRouter;
