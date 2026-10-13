import validateRequest from "../middlewares/validateRequest.js";
import { MAX_MOVIE_MINUTES, allowedGenres } from "../models/movies.js";

const movieSchema = {
  title: { required: true, type: "string" },
  genre: { required: true, type: "string", enum: allowedGenres },
  duration: { required: true, type: "number", min: 1, max: MAX_MOVIE_MINUTES },
  description: { type: "string" },
  language: { type: "string" },
  releaseDate: { type: "date" },
};

export const validateMovie = validateRequest(movieSchema);
export const validateMovieUpdate = validateRequest(movieSchema, { partial: true });
