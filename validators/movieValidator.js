import validateRequest from "../middlewares/validateRequest.js";

const allowedGenres = [
  "Action",
  "Comedy",
  "Drama",
  "Horror",
  "Sci-Fi",
  "Romance",
  "Animation",
  "Thriller",
];

const movieSchema = {
  title: { required: true, type: "string" },
  genre: { required: true, type: "string", enum: allowedGenres },
  duration: { required: true, type: "number", min: 1 },
  description: { type: "string" },
  language: { type: "string" },
  releaseDate: { type: "date" },
};

export const validateMovie = validateRequest(movieSchema);
