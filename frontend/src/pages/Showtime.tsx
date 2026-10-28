import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Armchair,
  CalendarDays,
  Check,
  CircleAlert,
  Clock,
  Eye,
  Grid3x3,
  LoaderCircle,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  Ticket,
} from "lucide-react";
import { api, ApiError, errorMessage } from "../api";
import { useAuth } from "../auth";
import { dayLabel, localDay, money, runtime, time } from "../format";
import { clock, useSecondsLeft } from "../hooks";
import { href } from "../route";
import { bestSeats } from "../seats";
import type { Booking, SeatMap, Showtime } from "../types";
import { CinemaHall } from "../components/CinemaHall";
import { Poster } from "../components/Poster";

const MAX_SEATS = 10;

// One showtime: pick seats in the 3D hall and hold them. The price is
// shown from the showtime, but the server works out the real total when it
// holds the seats.
export const ShowtimePage = ({ id }: { id?: string }) => {
  const { requireUser } = useAuth();
  const [showtime, setShowtime] = useState<Showtime | null>(null);
  const [map, setMap] = useState<SeatMap | null>(null);
  const [loadError, setLoadError] = useState("");
  const [count, setCount] = useState(2);
  const [picked, setPicked] = useState<string[]>([]);
  const [view, setView] = useState<"angled" | "top">("angled");
  const [holding, setHolding] = useState(false);
  const [held, setHeld] = useState<Booking | null>(null);
  const [holdError, setHoldError] = useState("");
  const holdLeft = useSecondsLeft(held?.holdExpiresAt);

  const loadSeats = useCallback(
    () => api<{ seatMap: SeatMap }>("GET", `/showTimes/${id}/seats`).then((data) => data.seatMap),
    [id]
  );

  const suggest = (seatMap: SeatMap, n: number) => {
    if (!seatMap.rows || !seatMap.seatsPerRow) return;
    setPicked(bestSeats(seatMap.rows, seatMap.seatsPerRow, new Set(seatMap.taken), n));
  };

  useEffect(() => {
    if (!id) return;
    Promise.all([api<{ showtime: Showtime }>("GET", `/showTimes/${id}`), loadSeats()])
      .then(([data, seatMap]) => {
        setShowtime(data.showtime);
        setMap(seatMap);
        const n = Math.min(2, seatMap.available);
        setCount(Math.max(n, 1));
        suggest(seatMap, n);
      })
      .catch((err) => setLoadError(err instanceof ApiError && err.status === 404 ? "This showtime doesn't exist." : errorMessage(err)));
  }, [id, loadSeats]);

  const taken = useMemo(() => new Set(map?.taken ?? []), [map]);
  const started = showtime ? new Date(showtime.startTime).getTime() <= Date.now() : false;
  const maxCount = Math.min(MAX_SEATS, map?.available ?? 0);

  const changeCount = (delta: number) => {
    if (!map) return;
    const next = Math.min(Math.max(count + delta, 1), Math.max(maxCount, 1));
    setCount(next);
    suggest(map, next);
  };

  // Tapping a seat zooms in to pick; a new seat replaces the oldest pick
  // once the count is reached
  const onSeat = (seat: string) => {
    setView("top");
    setHoldError("");
    setPicked((current) => {
      if (current.includes(seat)) return current.filter((s) => s !== seat);
      if (current.length < count) return [...current, seat];
      return [...current.slice(1), seat];
    });
  };

  const hold = async () => {
    const signedIn = await requireUser("Log in to hold your seats");
    if (!signedIn || !id) return;
    setHolding(true);
    setHoldError("");
    try {
      const { booking } = await api<{ booking: Booking }>("POST", "/bookings", { showtime: id, seats: picked });
      setHeld(booking);
      setView("angled");
      setMap(await loadSeats());
    } catch (err) {
      setHoldError(errorMessage(err));
      // Someone may have taken a seat meanwhile: show the hall as it is now
      const seatMap = await loadSeats().catch(() => null);
      if (seatMap) {
        setMap(seatMap);
        if (err instanceof ApiError && err.status === 409) suggest(seatMap, count);
      }
    } finally {
      setHolding(false);
    }
  };

  if (loadError) {
    return (
      <section className="placeholder card">
        <CircleAlert size={28} aria-hidden="true" />
        <h1>Showtime unavailable</h1>
        <p className="muted">{loadError}</p>
        <a className="button secondary" href={href("home")}>
          <ArrowLeft size={16} aria-hidden="true" /> What's on
        </a>
      </section>
    );
  }

  if (!showtime || !map) return <p className="loading">Loading the hall…</p>;

  const { movie, screen } = showtime;
  const rows = map.rows ?? screen.rows;
  const seatsPerRow = map.seatsPerRow ?? screen.seatsPerRow;
  const pickedSet = new Set(picked);
  const missing = count - picked.length;
  const soldOut = map.available === 0 && !held;

  return (
    <div className="showtime-page">
      <a className="back-link" href={href("home")}>
        <ArrowLeft size={16} aria-hidden="true" /> What's on
      </a>

      <div className="picker-layout">
        <section className="picker-hall card" aria-label="Seats">
          <div className="picker-toolbar">
            <div className="tabs" role="tablist" aria-label="View">
              <button
                type="button"
                role="tab"
                aria-selected={view === "angled"}
                className={view === "angled" ? "tab active" : "tab"}
                onClick={() => setView("angled")}
              >
                <Eye size={15} aria-hidden="true" /> Hall
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "top"}
                className={view === "top" ? "tab active" : "tab"}
                onClick={() => setView("top")}
                disabled={Boolean(held)}
              >
                <Grid3x3 size={15} aria-hidden="true" /> Pick seats
              </button>
            </div>
            <ul className="legend" aria-label="Seat colours">
              <li>
                <span className="seat free" aria-hidden="true" /> Free
              </li>
              <li>
                <span className="seat taken" aria-hidden="true" /> Taken
              </li>
              <li>
                <span className="seat picked" aria-hidden="true" /> Yours
              </li>
            </ul>
          </div>
          <CinemaHall
            rows={rows}
            seatsPerRow={seatsPerRow}
            view={view}
            label={`Seats for ${movie.title}`}
            stateOf={(row, seat) => {
              const seatId = `${row}${seat}`;
              if (pickedSet.has(seatId)) return "picked";
              return taken.has(seatId) ? "taken" : "free";
            }}
            onSeat={held || started ? undefined : onSeat}
          />
        </section>

        <aside className="picker-summary card">
          <div className="summary-movie">
            <Poster title={movie.title} genre={movie.genre} size="small" />
            <div>
              <h1>{movie.title}</h1>
              <ul className="meta">
                <li>{movie.genre}</li>
                <li>
                  <Clock size={14} aria-hidden="true" /> {runtime(movie.duration)}
                </li>
              </ul>
            </div>
          </div>

          <ul className="ticket-facts">
            <li>
              <CalendarDays size={15} aria-hidden="true" /> {dayLabel(localDay(new Date(showtime.startTime)))} · {time(showtime.startTime)}
            </li>
            <li>
              <MapPin size={15} aria-hidden="true" /> {screen.cinema?.name ?? "Cinema"} · Screen {screen.screenNumber}
            </li>
            <li>
              <Ticket size={15} aria-hidden="true" /> {money(showtime.price)} per seat · {map.available} free
            </li>
          </ul>

          {!held && !started && !soldOut && (
            <div className="summary-count">
              <span>Tickets</span>
              <div className="stepper">
                <button type="button" className="icon-button" onClick={() => changeCount(-1)} disabled={count <= 1} aria-label="One ticket less">
                  <Minus size={16} aria-hidden="true" />
                </button>
                <output aria-live="polite">{count}</output>
                <button type="button" className="icon-button" onClick={() => changeCount(1)} disabled={count >= maxCount} aria-label="One ticket more">
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
              <button type="button" className="button ghost small" onClick={() => suggest(map, count)}>
                <Sparkles size={15} aria-hidden="true" /> Best seats
              </button>
            </div>
          )}

          <div className="summary-seats">
            <Armchair size={15} aria-hidden="true" />
            {picked.length ? (
              <span className="seat-tags">
                {[...picked].sort().map((seat) => (
                  <span key={seat} className="seat-tag">
                    {seat}
                  </span>
                ))}
              </span>
            ) : (
              <span className="muted">Tap seats in the hall</span>
            )}
          </div>

          <div className="ticket-stub">
            <div className="ticket-amount">
              <span>Total</span>
              <strong>{money(held ? held.totalPrice : showtime.price * picked.length)}</strong>
            </div>
            <div className="ticket-action">
              {held ? (
                <p className="ticket-status done">
                  <Check size={16} aria-hidden="true" />
                  {holdLeft > 0 ? `Seats held · pay within ${clock(holdLeft)}` : "Hold ended · pick again"}
                </p>
              ) : started ? (
                <p className="ticket-status muted">This showtime has started</p>
              ) : soldOut ? (
                <p className="ticket-status muted">Sold out</p>
              ) : (
                <button type="button" className="button primary" onClick={hold} disabled={holding || missing !== 0}>
                  {holding ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                  {missing > 0 ? `Pick ${missing} more` : `Hold ${count} ${count === 1 ? "seat" : "seats"}`}
                </button>
              )}
            </div>
          </div>

          {holdError && (
            <p className="ticket-error" role="alert">
              <CircleAlert size={15} aria-hidden="true" /> {holdError}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
};
