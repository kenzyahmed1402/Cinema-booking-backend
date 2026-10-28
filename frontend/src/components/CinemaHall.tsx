// A cinema hall in CSS 3D: the floor tilts away from the viewer, the screen
// stands at its far end, and the camera glides in once when the page opens.
// Only the camera wrapper moves; the seats lie flat on a single floor layer,
// so the glide stays smooth on weak phones too.

export type SeatState = "free" | "taken" | "picked";

type Props = {
  rows: number;
  seatsPerRow: number;
  stateOf: (row: string, seat: number) => SeatState;
  label: string;
};

const rowLetter = (index: number) => String.fromCharCode(65 + index);

// Two aisles split each row into three blocks
const aisleBefore = (seat: number, seatsPerRow: number) => {
  const block = Math.round(seatsPerRow / 3);
  return seat === block + 1 || seat === seatsPerRow - block + 1;
};

export const CinemaHall = ({ rows, seatsPerRow, stateOf, label }: Props) => (
  <div className="hall-stage" role="img" aria-label={label}>
    <div className="hall-camera">
      <div className="hall-screen" />
      <div className="hall-floor">
        <p className="hall-screen-label">Screen</p>
        {Array.from({ length: rows }, (_, r) => {
          const row = rowLetter(r);
          return (
            <div key={row} className="hall-row">
              <span className="hall-row-label">{row}</span>
              {Array.from({ length: seatsPerRow }, (_, s) => {
                const seat = s + 1;
                const classes = ["seat", stateOf(row, seat)];
                if (aisleBefore(seat, seatsPerRow)) classes.push("aisle");
                return <span key={seat} className={classes.join(" ")} />;
              })}
              <span className="hall-row-label">{row}</span>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);
