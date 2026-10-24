import Booking, { SEAT_HOLDING_STATUSES } from "../models/Booking.js";
import Showtime from "../models/showTime.js";
import AppError from "./AppError.js";
import { expireHolds } from "./bookingHolds.js";

// Deletes the showtimes matching `filter` together with their inactive
// (cancelled, expired, refunded) bookings. Refuses (409) if any of them still
// has a booking that holds seats, since those are seats someone has bought or
// is paying for. `what` names the thing being deleted
// for the error message, e.g. "this screen".
export const deleteShowtimesWhere = async (filter, what) => {
  // A hold that has run out mustn't block the delete
  await expireHolds();

  const showtimeIds = await Showtime.find(filter).distinct("_id");
  if (showtimeIds.length === 0) {
    return;
  }

  const activeBookings = await Booking.countDocuments({
    showtime: { $in: showtimeIds },
    status: { $in: SEAT_HOLDING_STATUSES },
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
