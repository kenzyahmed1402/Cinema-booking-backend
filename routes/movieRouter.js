import express from "express";
import { createMovie, getMovies, getMovieById, updateMovie, deleteMovie } from "../controllers/movieController.js";

const MoviesRouter = express.Router();

MoviesRouter.get('/', getMovies);
MoviesRouter.get('/:id', getMovieById);
MoviesRouter.post('/', createMovie);
MoviesRouter.put('/:id', updateMovie);
MoviesRouter.delete('/:id', deleteMovie);

export default MoviesRouter;