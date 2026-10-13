import Booking from "../models/Booking.js";
import Showtime from "../models/showTime.js";
import AppError from "./AppError.js";

// Deletes the showtimes matching `filter` together with their cancelled
// bookings. Refuses (409) if any of them still has an active booking, since
// those are seats someone has bought. `what` names the thing being deleted
// for the error message, e.g. "this screen".
export const deleteShowtimesWhere = async (filter, what) => {
  const showtimeIds = await Showtime.find(filter).distinct("_id");
  if (showtimeIds.length === 0) {
    return;
  }

  const activeBookings = await Booking.countDocuments({
    showtime: { $in: showtimeIds },
    status: { $ne: "cancelled" },
  });
  if (activeBookings > 0) {
    throw new AppError(
      `Can't delete ${what}: it has ${activeBookings} active booking(s). Cancel or delete them first.`,
      409
    );
  }

  await Booking.deleteMany({ showtime: { $in: showtimeIds } });
  await Showtime.deleteMany({ _id: { $in: showtimeIds } });
};
