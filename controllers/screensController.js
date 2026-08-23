import Screen from "../models/screens.js";
import Cinema from "../models/cinema.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";

export const createScreen = catchAsync(async (req, res) => {
  const { cinema } = req.body;

  const cinemaExists = await Cinema.findById(cinema);
  if (!cinemaExists) {
    throw new AppError("Cinema not found", 404);
  }

  const screen = await Screen.create(req.body);
  res.status(201).json({
    status: "success",
    data: { screen },
  });
});

export const getScreens = catchAsync(async (req, res) => {
  const screens = await Screen.find().populate("cinema");
  res.json({
    status: "success",
    results: screens.length,
    data: { screens },
  });
});

export const getScreenById = catchAsync(async (req, res) => {
  const screen = await Screen.findById(req.params.id).populate("cinema");

  if (!screen) {
    throw new AppError("Screen not found", 404);
  }

  res.json({
    status: "success",
    data: { screen },
  });
});

export const updateScreen = catchAsync(async (req, res) => {
  if (req.body.cinema) {
    const cinemaExists = await Cinema.findById(req.body.cinema);
    if (!cinemaExists) {
      throw new AppError("Cinema not found", 404);
    }
  }

  const screen = await Screen.findOneAndUpdate(
    { _id: req.params.id },
    req.body,
    { new: true, runValidators: true }
  ).populate("cinema");

  if (!screen) {
    throw new AppError("Screen not found", 404);
  }

  res.json({
    status: "success",
    data: { screen },
  });
});

export const deleteScreen = catchAsync(async (req, res) => {
  const screen = await Screen.findOneAndDelete({ _id: req.params.id });

  if (!screen) {
    throw new AppError("Screen not found", 404);
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
});
