import Movie from "../models/movies.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";

export const createMovie = catchAsync(async (req, res) => {
  const movie = await Movie.create(req.body);
  res.status(201).json({
    status: "success",
    data: { movie },
  });
});

export const getMovies = catchAsync(async (req, res) => {
  const movies = await Movie.find();
  res.json({
    status: "success",
    results: movies.length,
    data: { movies },
  });
});

export const getMovieById = catchAsync(async (req, res) => {
  const movie = await Movie.findById(req.params.id);

  if (!movie) {
    throw new AppError("Movie not found", 404);
  }

  res.json({
    status: "success",
    data: { movie },
  });
});

export const updateMovie = catchAsync(async (req, res) => {
  const movie = await Movie.findOneAndUpdate(
    { _id: req.params.id },
    req.body,
    { new: true, runValidators: true }
  );

  if (!movie) {
    throw new AppError("Movie not found", 404);
  }

  res.json({
    status: "success",
    data: { movie },
  });
});

export const deleteMovie = catchAsync(async (req, res) => {
  const movie = await Movie.findOneAndDelete({ _id: req.params.id });

  if (!movie) {
    throw new AppError("Movie not found", 404);
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
});
