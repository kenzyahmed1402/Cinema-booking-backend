import express from "express";
import {
  createShowtime,
  getShowtimes,
  getShowtimeById,
  updateShowtime,
  deleteShowtime,
} from "../controllers/showTimeController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateShowtime } from "../validators/showtimeValidator.js";

const STRouter = express.Router();

STRouter.get("/", getShowtimes);
STRouter.get("/:id", validateObjectId(), getShowtimeById);
STRouter.post("/", validateShowtime, createShowtime);
STRouter.put("/:id", validateObjectId(), validateShowtime, updateShowtime);
STRouter.delete("/:id", validateObjectId(), deleteShowtime);

export default STRouter;
