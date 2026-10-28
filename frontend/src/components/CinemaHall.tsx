// A cinema hall in CSS 3D: the floor tilts away from the viewer, the screen
// stands at its far end, and the camera glides in once when the page opens.
// Only the camera wrapper moves; the seats lie flat on a single floor layer,
// so the glide stays smooth on weak phones too.
//
// With onSeat, the seats are buttons: the seat picker. Its "top" view tilts
// the camera down over the seats so they are big enough to tap.

export type SeatState = "free" | "taken" | "picked";

type Props = {
  rows: number;
  seatsPerRow: number;
  stateOf: (row: string, seat: number) => SeatState;
  label: string;
  className?: string;
  onSeat?: (seat: string) => void;
  view?: "angled" | "top";
};

export const rowLetter = (index: number) => String.fromCharCode(65 + index);

// Two aisles split each row into three blocks
export const aisleBefore = (seat: number, seatsPerRow: number) => {
  const block = Math.round(seatsPerRow / 3);
  return seat === block + 1 || seat === seatsPerRow - block + 1;
};

const STATE_NAMES: Record<SeatState, string> = { free: "free", taken: "taken", picked: "selected" };

export const CinemaHall = ({ rows, seatsPerRow, stateOf, label, className, onSeat, view = "angled" }: Props) => {
  const classes = ["hall-stage", className, onSeat && "picker", view === "top" && "top"].filter(Boolean).join(" ");
  return (
    <div className={classes} role={onSeat ? "group" : "img"} aria-label={label}>
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
                  const state = stateOf(row, seat);
                  const classes = ["seat", state];
                  if (aisleBefore(seat, seatsPerRow)) classes.push("aisle");
                  if (!onSeat) return <span key={seat} className={classes.join(" ")} />;
                  return (
                    <button
                      key={seat}
                      type="button"
                      className={classes.join(" ")}
                      disabled={state === "taken"}
                      aria-pressed={state === "picked"}
                      aria-label={`Row ${row}, seat ${seat}, ${STATE_NAMES[state]}`}
                      onClick={() => onSeat(`${row}${seat}`)}
                    />
                  );
                })}
                <span className="hall-row-label">{row}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
