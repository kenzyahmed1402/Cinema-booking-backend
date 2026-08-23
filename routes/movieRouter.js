import express from "express";
import {
  createMovie,
  getMovies,
  getMovieById,
  updateMovie,
  deleteMovie,
} from "../controllers/movieController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateMovie } from "../validators/movieValidator.js";

const MoviesRouter = express.Router();

MoviesRouter.get("/", getMovies);
MoviesRouter.get("/:id", validateObjectId(), getMovieById);
MoviesRouter.post("/", validateMovie, createMovie);
MoviesRouter.put("/:id", validateObjectId(), validateMovie, updateMovie);
MoviesRouter.delete("/:id", validateObjectId(), deleteMovie);

export default MoviesRouter;
