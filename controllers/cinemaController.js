import Cinema from "../models/cinema.js";
import Screen from "../models/screens.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { getPagination, sendPage } from "../utils/listQuery.js";
import { deleteShowtimesWhere } from "../utils/cascade.js";

export const createCinema = catchAsync(async (req, res) => {
  const cinema = await Cinema.create(req.body);
  res.status(201).json({
    status: "success",
    data: { cinema },
  });
});

export const getCinemas = catchAsync(async (req, res) => {
  const pagination = getPagination(req.query);
  const query = Cinema.find()
    .sort({ name: 1, _id: 1 })
    .skip(pagination.skip)
    .limit(pagination.limit);

  await sendPage(res, "cinemas", query, await Cinema.countDocuments(), pagination);
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
  const cinema = await Cinema.findById(req.params.id);
  if (!cinema) {
    throw new AppError("Cinema not found", 404);
  }

  // Its screens and their showtimes go too, unless a showtime on one of
  // them has active bookings
  const screenIds = await Screen.find({ cinema: cinema._id }).distinct("_id");
  await deleteShowtimesWhere({ screen: { $in: screenIds } }, "this cinema");
  await Screen.deleteMany({ _id: { $in: screenIds } });
  await Cinema.deleteOne({ _id: cinema._id });

  res.status(204).json({
    status: "success",
    data: null,
  });
});
