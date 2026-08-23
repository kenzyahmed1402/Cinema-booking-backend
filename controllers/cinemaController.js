import Cinema from "../models/cinema.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";

export const createCinema = catchAsync(async (req, res) => {
  const cinema = await Cinema.create(req.body);
  res.status(201).json({
    status: "success",
    data: { cinema },
  });
});

export const getCinemas = catchAsync(async (req, res) => {
  const cinemas = await Cinema.find();
  res.json({
    status: "success",
    results: cinemas.length,
    data: { cinemas },
  });
});

export const getCinemaById = catchAsync(async (req, res) => {
  const cinema = await Cinema.findById(req.params.id);

  if (!cinema) {
    throw new AppError("Cinema not found", 404);
  }

  res.json({
    status: "success",
    data: { cinema },
  });
});

export const updateCinema = catchAsync(async (req, res) => {
  const cinema = await Cinema.findOneAndUpdate(
    { _id: req.params.id },
    req.body,
    { new: true, runValidators: true }
  );

  if (!cinema) {
    throw new AppError("Cinema not found", 404);
  }

  res.json({
    status: "success",
    data: { cinema },
  });
});

export const deleteCinema = catchAsync(async (req, res) => {
  const cinema = await Cinema.findOneAndDelete({ _id: req.params.id });

  if (!cinema) {
    throw new AppError("Cinema not found", 404);
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
});
