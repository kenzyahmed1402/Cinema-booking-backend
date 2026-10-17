import Showtime from "../models/showTime.js";

// Atomically adds the seats to the showtime only if none of them are taken.
// Resolves to null if the showtime doesn't exist or a seat is already booked.
export const reserveSeats = (showtime, seats) =>
  Showtime.findOneAndUpdate(
    { _id: showtime, bookedSeats: { $nin: seats } },
    { $addToSet: { bookedSeats: { $each: seats } } },
    { returnDocument: "after" }
  );

export const releaseSeats = (showtime, seats) =>
  Showtime.updateOne(
    { _id: showtime },
    { $pull: { bookedSeats: { $in: seats } } }
  );
