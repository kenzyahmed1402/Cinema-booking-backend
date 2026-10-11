import mongoose from "mongoose";

// Upper limit so showtime overlap checks know how far back to look
export const MAX_MOVIE_MINUTES = 600;

export const allowedGenres = [
  "Action",
  "Comedy",
  "Drama",
  "Horror",
  "Sci-Fi",
  "Romance",
  "Animation",
  "Thriller",
];

const movieSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Movie title is required"],
      trim: true,
      maxlength: [200, "Movie title cannot exceed 200 characters"],
      index: true,
    },
    genre: {
      type: String,
      required: [true, "Movie genre is required"],
      enum: {
        values: allowedGenres,
        message: `Genre must be one of: ${allowedGenres.join(", ")}`,
      },
    },
    duration: {
      type: Number,
      required: [true, "Movie duration is required"],
      min: [1, "Duration must be at least 1 minute"],
      max: [MAX_MOVIE_MINUTES, `Duration cannot exceed ${MAX_MOVIE_MINUTES} minutes`],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    language: {
      type: String,
      default: "English",
      trim: true,
    },
    releaseDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

movieSchema.index({ genre: 1, releaseDate: -1 });

const Movie = mongoose.model("Movie", movieSchema);
export default Movie;
