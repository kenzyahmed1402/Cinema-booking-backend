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

const cinemaRouter = express.Router();

cinemaRouter.get("/", getCinemas);
cinemaRouter.get("/:id", validateObjectId(), getCinemaById);
cinemaRouter.post("/", validateCinema, createCinema);
cinemaRouter.put("/:id", validateObjectId(), validateCinema, updateCinema);
cinemaRouter.delete("/:id", validateObjectId(), deleteCinema);

export default cinemaRouter;
