import express from "express";
import {
  createMovie,
  getMovies,
  getMovieById,
  updateMovie,
  deleteMovie,
} from "../controllers/movieController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateMovie, validateMovieUpdate } from "../validators/movieValidator.js";
import { protect, restrictTo } from "../middlewares/auth.js";

const MoviesRouter = express.Router();

MoviesRouter.get("/", getMovies);
MoviesRouter.get("/:id", validateObjectId(), getMovieById);
MoviesRouter.post("/", protect, restrictTo("ADMIN"), validateMovie, createMovie);
MoviesRouter.put("/:id", protect, restrictTo("ADMIN"), validateObjectId(), validateMovieUpdate, updateMovie);
MoviesRouter.delete("/:id", protect, restrictTo("ADMIN"), validateObjectId(), deleteMovie);

export default MoviesRouter;
