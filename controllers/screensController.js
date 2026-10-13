import Screen from "../models/screens.js";
import Cinema from "../models/cinema.js";
import Showtime from "../models/showTime.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { buildFilter, getPagination, idFilter, sendPage } from "../utils/listQuery.js";
import { deleteShowtimesWhere } from "../utils/cascade.js";
import { describeLayout, seatsNotOnScreen } from "../utils/seatLayout.js";

export const createScreen = catchAsync(async (req, res) => {
  const { cinema, rows, seatsPerRow } = req.body;

  const cinemaExists = await Cinema.findById(cinema);
  if (!cinemaExists) {
    throw new AppError("Cinema not found", 404);
  }

  const screen = await Screen.create({ ...req.body, capacity: rows * seatsPerRow });
  res.status(201).json({
    status: "success",
    data: { screen },
  });
});

// Filters: ?cinema=<id>
export const getScreens = catchAsync(async (req, res) => {
  const pagination = getPagination(req.query);
  const filter = buildFilter({
    cinema: idFilter(req.query, "cinema"),
  });
  const query = Screen.find(filter)
    .sort({ cinema: 1, screenNumber: 1, _id: 1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .populate("cinema");

  await sendPage(res, "screens", query, await Screen.countDocuments(filter), pagination);
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

  const changes = { ...req.body };

  if (changes.rows !== undefined || changes.seatsPerRow !== undefined) {
    const existing = await Screen.findById(req.params.id);
    if (!existing) {
      throw new AppError("Screen not found", 404);
    }

    const layout = {
      rows: changes.rows ?? existing.rows,
      seatsPerRow: changes.seatsPerRow ?? existing.seatsPerRow,
    };
    if (!layout.rows || !layout.seatsPerRow) {
      throw new AppError("Send both rows and seatsPerRow to give this screen a layout", 400);
    }

    // A smaller layout can't drop seats that are already booked
    const showtimes = await Showtime.find({
      screen: req.params.id,
      "bookedSeats.0": { $exists: true },
    });
    for (const showtime of showtimes) {
      const lost = seatsNotOnScreen(layout, showtime.bookedSeats);
      if (lost.length > 0) {
        throw new AppError(
          `Can't change to ${describeLayout(layout)}: seats ${lost.join(", ")} are booked for showtime ${showtime._id}`,
          409
        );
      }
    }

    changes.capacity = layout.rows * layout.seatsPerRow;
  }

  const screen = await Screen.findOneAndUpdate(
    { _id: req.params.id },
    changes,
    { returnDocument: "after", runValidators: true }
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
  const screen = await Screen.findById(req.params.id);
  if (!screen) {
    throw new AppError("Screen not found", 404);
  }

  // Its showtimes go too, unless one of them has active bookings
  await deleteShowtimesWhere({ screen: screen._id }, "this screen");
  await Screen.deleteOne({ _id: screen._id });

  res.status(204).json({
    status: "success",
    data: null,
  });
});
