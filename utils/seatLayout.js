import AppError from "./AppError.js";

const ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const hasLayout = (screen) => Boolean(screen.rows && screen.seatsPerRow);

export const describeLayout = (screen) =>
  `rows A-${ROW_LETTERS[screen.rows - 1]}, seats 1-${screen.seatsPerRow}`;

// Seat codes are a row letter and a seat number: A1 is row A, seat 1.
// Returns the seats that don't exist in the screen's rows x seatsPerRow layout.
export const seatsNotOnScreen = (screen, seats) =>
  seats.filter((seat) => {
    const row = ROW_LETTERS.indexOf(seat[0]) + 1;
    const number = Number(seat.slice(1));
    return row < 1 || row > screen.rows || number < 1 || number > screen.seatsPerRow;
  });

// Throws unless the seats can go on this screen. Screens with a layout check
// that every seat exists; older screens that only have a capacity check that
// adding the seats doesn't go over it.
export const assertSeatsFit = (screen, seats, { alreadyBooked, adding = seats.length }) => {
  if (!screen) {
    throw new AppError("This showtime's screen no longer exists", 409);
  }

  if (hasLayout(screen)) {
    const missing = seatsNotOnScreen(screen, seats);
    if (missing.length > 0) {
      throw new AppError(
        `Seats not on this screen: ${missing.join(", ")} (${describeLayout(screen)})`,
        400
      );
    }
  } else if (alreadyBooked + adding > screen.capacity) {
    throw new AppError(
      `Not enough seats: ${Math.max(screen.capacity - alreadyBooked, 0)} of ${screen.capacity} left`,
      409
    );
  }
};
