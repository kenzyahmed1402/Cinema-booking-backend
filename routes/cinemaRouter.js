import express from "express";
import {
  createCinema,
  getCinemas,
  getCinemaById,
  updateCinema,
  deleteCinema,
} from "../controllers/cinemaController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateCinema } from "../validators/cinemaValidator.js";
import { protect, restrictTo } from "../middlewares/auth.js";

const cinemaRouter = express.Router();

cinemaRouter.get("/", getCinemas);
cinemaRouter.get("/:id", validateObjectId(), getCinemaById);
cinemaRouter.post("/", protect, restrictTo("ADMIN"), validateCinema, createCinema);
cinemaRouter.put("/:id", protect, restrictTo("ADMIN"), validateObjectId(), validateCinema, updateCinema);
cinemaRouter.delete("/:id", protect, restrictTo("ADMIN"), validateObjectId(), deleteCinema);

export default cinemaRouter;
