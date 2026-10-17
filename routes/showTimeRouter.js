import express from "express";
import {
  createShowtime,
  getShowtimes,
  getShowtimeById,
  getSeatMap,
  updateShowtime,
  deleteShowtime,
} from "../controllers/showTimeController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateShowtime, validateShowtimeUpdate } from "../validators/showtimeValidator.js";
import { protect, restrictTo } from "../middlewares/auth.js";
import { expireOverdueHolds } from "../utils/bookingHolds.js";

const STRouter = express.Router();

// Seat counts never include holds that have already run out
STRouter.get("/", expireOverdueHolds, getShowtimes);
STRouter.get("/:id", validateObjectId(), expireOverdueHolds, getShowtimeById);
STRouter.get("/:id/seats", validateObjectId(), expireOverdueHolds, getSeatMap);
STRouter.post("/", protect, restrictTo("ADMIN"), validateShowtime, createShowtime);
STRouter.put("/:id", protect, restrictTo("ADMIN"), validateObjectId(), validateShowtimeUpdate, updateShowtime);
STRouter.delete("/:id", protect, restrictTo("ADMIN"), validateObjectId(), deleteShowtime);

export default STRouter;
