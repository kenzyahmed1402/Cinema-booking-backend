import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Film,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Sparkles,
  Ticket,
  TicketX,
  X,
} from "lucide-react";
import { api, errorMessage } from "../api";
import { longDate, money } from "../format";
import { clock, useSecondsLeft } from "../hooks";
import { href } from "../route";
import type { BookingDetail } from "../types";
import { Poster } from "../components/Poster";

// GET /bookings/:id/cancellation-quote: what cancelling refunds right now
type Quote = {
  allowed: boolean;
  refundPercent: number;
  refundCents: number;
  paidCents: number;
  policy: string;
  reason?: string;
};

const cents = (value: number) => money(value / 100);

const STATUS: Record<BookingDetail["status"], { label: string; tone: string }> = {
  pending: { label: "Not paid", tone: "warn" },
  confirmed: { label: "Paid", tone: "ok" },
  needs_review: { label: "Being checked", tone: "warn" },
  refunded: { label: "Refunded", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
};

const isUpcoming = (booking: BookingDetail) =>
  new Date(booking.showtime.startTime).getTime() > Date.now() &&
  ["pending", "confirmed", "needs_review"].includes(booking.status);

// Asks before anything changes: the refund for a paid booking, or giving
// back the seats of an unpaid one
const ConfirmDialog = ({
  booking,
  onClose,
  onDone,
}: {
  booking: BookingDetail;
  onClose: () => void;
  onDone: (changed: BookingDetail, note: string) => void;
}) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const paid = booking.status === "confirmed";
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const loadQuote = useCallback(
    () =>
      api<{ quote: Quote }>("GET", `/bookings/${booking._id}/cancellation-quote`)
        .then((data) => setQuote(data.quote))
        .catch((err) => setError(errorMessage(err))),
    [booking._id]
  );

  useEffect(() => {
    if (paid) loadQuote();
  }, [paid, loadQuote]);

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      if (paid && quote) {
        // The refund shown here comes along: if it changed meanwhile, the
        // server refuses and nothing is cancelled
        await api("POST", `/bookings/${booking._id}/cancel`, { confirm: true, expectedRefundCents: quote.refundCents });
        onDone({ ...booking, status: "refunded" }, `Cancelled · ${cents(quote.refundCents)} refunded to PayPal`);
      } else {
        await api("PUT", `/bookings/${booking._id}`, { status: "cancelled" });
        onDone({ ...booking, status: "cancelled" }, "Seats released · nothing was charged");
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      if (paid) loadQuote();
    }
  };

  return (
    <dialog ref={dialog} className="auth-dialog confirm-dialog" onCancel={onClose} aria-labelledby="confirm-title">
      <button type="button" className="icon-button close" onClick={onClose} aria-label="Close">
        <X size={18} aria-hidden="true" />
      </button>
      <h2 id="confirm-title">{paid ? "Cancel booking?" : "Release seats?"}</h2>
      <p className="muted">
        {booking.showtime.movie.title} · {[...booking.seats].sort().join(", ")}
      </p>

      {paid && !quote && !error && (
        <p className="ticket-status">
          <LoaderCircle className="spin" size={16} aria-hidden="true" /> Checking the refund…
        </p>
      )}

      {paid && quote && (
        <dl className="refund-lines">
          <div>
            <dt>Paid</dt>
            <dd>{cents(quote.paidCents)}</dd>
          </div>
          <div className="refund-total">
            <dt>Refund · {quote.refundPercent}%</dt>
            <dd>{cents(quote.refundCents)}</dd>
          </div>
        </dl>
      )}
      {paid && quote && <p className="hint">{quote.policy}</p>}
      {!paid && <p className="hint">Nothing was charged for this booking.</p>}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" className="button ghost" onClick={onClose}>
          Keep booking
        </button>
        {paid && quote && !quote.allowed ? (
          <p className="ticket-status muted">Can't be cancelled · {quote.reason?.toLowerCase()}</p>
        ) : (
          <button type="button" className="button danger" onClick={confirm} disabled={busy || (paid && !quote)}>
            {busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <TicketX size={16} aria-hidden="true" />}
            {paid ? (quote ? `Cancel and refund ${cents(quote.refundCents)}` : "Cancel") : "Release seats"}
          </button>
        )}
      </div>
    </dialog>
  );
};

const BookingRow = ({ booking, onAsk }: { booking: BookingDetail; onAsk: (booking: BookingDetail) => void }) => {
  const { showtime } = booking;
  const holdLeft = useSecondsLeft(booking.status === "pending" ? booking.holdExpiresAt : undefined);
  const status = STATUS[booking.status];
  const upcoming = isUpcoming(booking);

  return (
    <article className="ticket booking-row glow">
      <div className="ticket-main">
        <Poster title={showtime.movie.title} genre={showtime.movie.genre} size="small" />
        <div className="ticket-body">
          <p className={`status-badge ${status.tone}`}>{status.label}</p>
          <h3>{showtime.movie.title}</h3>
          <ul className="ticket-facts">
            <li>
              <CalendarDays size={15} aria-hidden="true" /> {longDate(showtime.startTime)}
            </li>
            <li>
              <MapPin size={15} aria-hidden="true" /> {showtime.screen.cinema?.name ?? "Cinema"} · Screen {showtime.screen.screenNumber}
            </li>
            <li>
              <Ticket size={15} aria-hidden="true" /> {[...booking.seats].sort().join(", ")} · {money(booking.totalPrice)}
            </li>
          </ul>
        </div>
      </div>
      {upcoming && (
        <div className="row-actions">
          {booking.status === "confirmed" && (
            <>
              <a className="button primary small" href={href("booking", booking._id)}>
                View ticket <ArrowRight size={15} aria-hidden="true" />
              </a>
              <button type="button" className="button ghost small" onClick={() => onAsk(booking)}>
                <TicketX size={15} aria-hidden="true" /> Cancel
              </button>
            </>
          )}
          {booking.status === "pending" && (
            <>
              {holdLeft > 0 && <span className="hold-clock small">{clock(holdLeft)} left</span>}
              <a className="button primary small" href={href("booking", booking._id)}>
                Pay now <ArrowRight size={15} aria-hidden="true" />
              </a>
              <button type="button" className="button ghost small" onClick={() => onAsk(booking)}>
                Release seats
              </button>
            </>
          )}
          {booking.status === "needs_review" && (
            <p className="ticket-status">
              <ShieldCheck size={15} aria-hidden="true" /> Refunded if anything is wrong
            </p>
          )}
        </div>
      )}
    </article>
  );
};

// The logged-in customer's bookings: pay, open tickets, cancel
export const BookingsPage = () => {
  const [bookings, setBookings] = useState<BookingDetail[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [asking, setAsking] = useState<BookingDetail | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    api<{ bookings: BookingDetail[] }>("GET", "/bookings?limit=100")
      .then((data) => setBookings(data.bookings.filter((b) => b.showtime?.movie)))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const [upcoming, past] = useMemo(() => {
    const all = bookings ?? [];
    const time = (b: BookingDetail) => new Date(b.showtime.startTime).getTime();
    return [
      all.filter(isUpcoming).sort((a, b) => time(a) - time(b)),
      all.filter((b) => !isUpcoming(b)).sort((a, b) => time(b) - time(a)),
    ];
  }, [bookings]);

  const shown = tab === "upcoming" ? upcoming : past;

  const done = (changed: BookingDetail, message: string) => {
    setBookings((all) => all?.map((b) => (b._id === changed._id ? changed : b)) ?? null);
    setAsking(null);
    setNote(message);
  };

  return (
    <div className="bookings-page">
      <h1 className="section-title">
        <Ticket size={22} aria-hidden="true" /> My bookings
      </h1>

      <div className="tabs" role="tablist" aria-label="Bookings">
        {(["upcoming", "past"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "tab active" : "tab"}
            onClick={() => setTab(value)}
          >
            {value === "upcoming" ? `Upcoming · ${upcoming.length}` : `Past · ${past.length}`}
          </button>
        ))}
      </div>

      {note && (
        <p className="booking-note" role="status">
          <ShieldCheck size={16} aria-hidden="true" /> {note}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          <CircleAlert size={15} aria-hidden="true" /> {error}
        </p>
      )}
      {!bookings && !error && <p className="loading">Loading your bookings…</p>}

      {bookings && shown.length === 0 && (
        <div className="bookings-empty card">
          <span className="step-icon" aria-hidden="true">
            <Ticket size={22} />
          </span>
          <h2>{tab === "upcoming" ? "No upcoming bookings" : "Nothing here yet"}</h2>
          <div className="dialog-actions">
            <a className="button secondary" href={href("home")}>
              <Film size={16} aria-hidden="true" /> What's on
            </a>
            <a className="button secondary" href={href("chat")}>
              <Sparkles size={16} aria-hidden="true" /> Ask the assistant
            </a>
          </div>
        </div>
      )}

      <div className="listing">
        {shown.map((booking) => (
          <BookingRow key={booking._id} booking={booking} onAsk={setAsking} />
        ))}
      </div>

      {asking && <ConfirmDialog booking={asking} onClose={() => setAsking(null)} onDone={done} />}
    </div>
  );
};
