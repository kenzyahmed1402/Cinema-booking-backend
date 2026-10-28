import { aisleBefore, rowLetter } from "./components/CinemaHall";

// The best free seats for a group: side by side in one row, as close as
// possible to the middle of the hall and about 60% of the way back, the
// spot cinemas sell first. Seats across an aisle count only when no row has
// room otherwise; with no room together at all, the best single seats.
// A suggestion only: the server still checks every seat when holding them.
export const bestSeats = (rows: number, seatsPerRow: number, taken: Set<string>, count: number): string[] => {
  if (count < 1) return [];
  const centre = (seatsPerRow + 1) / 2;
  const idealRow = (rows - 1) * 0.6;
  let best: string[] = [];
  let bestScore = Infinity;

  for (let r = 0; r < rows; r++) {
    for (let start = 1; start + count - 1 <= seatsPerRow; start++) {
      const seats = Array.from({ length: count }, (_, i) => `${rowLetter(r)}${start + i}`);
      if (seats.some((seat) => taken.has(seat))) continue;
      let crossesAisle = false;
      for (let seat = start + 1; seat < start + count; seat++) if (aisleBefore(seat, seatsPerRow)) crossesAisle = true;
      const middle = start + (count - 1) / 2;
      const score = Math.abs(r - idealRow) + Math.abs(middle - centre) * 0.6 + (crossesAisle ? 4 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = seats;
      }
    }
  }
  if (best.length) return best;

  const singles: { seat: string; score: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let seat = 1; seat <= seatsPerRow; seat++) {
      const id = `${rowLetter(r)}${seat}`;
      if (!taken.has(id)) singles.push({ seat: id, score: Math.abs(r - idealRow) + Math.abs(seat - centre) * 0.6 });
    }
  }
  return singles
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map(({ seat }) => seat);
};
