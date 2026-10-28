import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Armchair,
  CalendarDays,
  CircleAlert,
  Clock,
  Download,
  LoaderCircle,
  MapPin,
  Printer,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { api, ApiError, errorMessage } from "../api";
import { useAuth } from "../auth";
import { longDate, money } from "../format";
import { clock, useSecondsLeft } from "../hooks";
import { loadPayPal, type PayPalButtons } from "../paypal";
import { go, href } from "../route";
import type { Booking, BookingDetail, Payment } from "../types";
import { Poster } from "../components/Poster";
import { TicketCard } from "../components/TicketCard";
import { downloadTicketImage } from "../ticketImage";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// PayPal's button. The order is created by the server from the booking (the
// browser never sends an amount), and the payment counts only once the
// server has captured it and checked PayPal's answer.
const PayPalButton = ({ bookingId, onPaid }: { bookingId: string; onPaid: (booking: Booking) => void }) => {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [message, setMessage] = useState("");
  // Our own error message, kept because PayPal passes on only a generic one
  const lastError = useRef("");

  useEffect(() => {
    let buttons: PayPalButtons | null = null;
    let gone = false;
    loadPayPal()
      .then((paypal) => {
        if (gone || !container.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", color: "white", shape: "pill", label: "pay", height: 48 },
          createOrder: async () => {
            setMessage("");
            lastError.current = "";
            try {
              const { payment } = await api<{ payment: Payment }>("POST", "/payments/orders", { booking: bookingId });
              return payment.paypalOrderId;
            } catch (err) {
              lastError.current = errorMessage(err);
              throw err;
            }
          },
          onApprove: async ({ orderID }) => {
            try {
              const { booking } = await api<{ booking: Booking }>("POST", "/payments/capture", { orderId: orderID });
              onPaid(booking);
            } catch (err) {
              lastError.current = errorMessage(err);
              throw err;
            }
          },
          onCancel: () => setMessage("Payment cancelled · you can try again"),
          onError: () => setMessage(lastError.current || "PayPal couldn't finish the payment. Please try again."),
        });
        if (!buttons.isEligible()) throw new Error("PayPal isn't available in this browser");
        return buttons.render(container.current).then(() => setState("ready"));
      })
      .catch((err) => {
        if (!gone) {
          setState("failed");
          setMessage(errorMessage(err));
        }
      });
    return () => {
      gone = true;
      buttons?.close().catch(() => undefined);
    };
  }, [bookingId, onPaid]);

  return (
    <div className="paypal-area">
      {state === "loading" && (
        <p className="ticket-status">
          <LoaderCircle className="spin" size={16} aria-hidden="true" /> Loading PayPal…
        </p>
      )}
      <div ref={container} className="paypal-buttons" />
      {message && (
        <p className="ticket-error" role="alert">
          <CircleAlert size={15} aria-hidden="true" /> {message}
        </p>
      )}
    </div>
  );
};

// A guest's account becomes a normal one, so the booking isn't lost when
// this browser's cookie goes
const SaveBooking = () => {
  const { upgrade } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await upgrade(name, email, password);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <section className="save-booking card done">
        <UserRoundCheck size={22} aria-hidden="true" />
        <div>
          <h3>Booking saved</h3>
          <p className="muted">Log in with {email} on any device</p>
        </div>
      </section>
    );
  }

  return (
    <section className="save-booking card" aria-labelledby="save-title">
      <div className="save-head">
        <UserRoundCheck size={22} aria-hidden="true" />
        <div>
          <h3 id="save-title">Save your booking</h3>
          <p className="muted">Guest bookings live in this browser only</p>
        </div>
      </div>
      <form className="stack" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button secondary wide" disabled={busy}>
          {busy ? "Saving…" : "Save booking"}
        </button>
      </form>
    </section>
  );
};

type Phase = "checkout" | "flipping" | "ticket";

// One booking: pay for it while its seats are held, then its ticket
export const BookingPage = ({ id }: { id?: string }) => {
  const { user, requireUser } = useAuth();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<Phase>("checkout");
  const [justPaid, setJustPaid] = useState(false);
  // Shown to guests, and kept after saving so it can say it worked
  const [offerSave, setOfferSave] = useState(false);
  useEffect(() => {
    if (user?.isGuest) setOfferSave(true);
  }, [user]);
  const [saving, setSaving] = useState(false);
  const ticket = useRef<HTMLDivElement>(null);
  const holdLeft = useSecondsLeft(booking?.status === "pending" ? booking.holdExpiresAt : undefined);

  // Only the booking's owner can see it: a visitor is asked to log in first
  useEffect(() => {
    if (user === undefined || !id) return;
    if (user === null) {
      requireUser("Log in to see this booking").then((next) => {
        if (!next) go("home");
      });
      return;
    }
    api<{ booking: BookingDetail }>("GET", `/bookings/${id}`)
      .then((data) => {
        setBooking(data.booking);
        setPhase(data.booking.status === "confirmed" ? "ticket" : "checkout");
      })
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "This booking doesn't exist, or it isn't yours." : errorMessage(err)));
  }, [id, user, requireUser]);

  // Paid: the checkout card turns over to show the ticket
  const onPaid = useRef((paid: Booking) => {
    setBooking((current) => (current ? { ...current, status: paid.status as BookingDetail["status"], holdExpiresAt: undefined } : current));
    setJustPaid(true);
    setPhase(reducedMotion() ? "ticket" : "flipping");
  }).current;

  const saveImage = async () => {
    if (!booking) return;
    setSaving(true);
    try {
      await downloadTicketImage(booking, ticket.current?.querySelector(".poster-art") ?? null);
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <section className="placeholder card">
        <CircleAlert size={28} aria-hidden="true" />
        <h1>Booking unavailable</h1>
        <p className="muted">{error}</p>
        <a className="button secondary" href={href("home")}>
          <ArrowLeft size={16} aria-hidden="true" /> What's on
        </a>
      </section>
    );
  }
  if (!booking) return <p className="loading">Loading your booking…</p>;

  const { showtime } = booking;
  const { movie } = showtime;

  if (phase === "ticket") {
    return (
      <div className="booking-page">
        <div className={justPaid ? "ticket-flip in" : undefined} ref={ticket}>
          <p className="booking-done">
            <ShieldCheck size={18} aria-hidden="true" /> Paid · enjoy the film
          </p>
          <TicketCard booking={booking} />
        </div>
        <div className="ticket-actions">
          <button type="button" className="button secondary" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" /> Print or save PDF
          </button>
          <button type="button" className="button secondary" onClick={saveImage} disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} Save image
          </button>
        </div>
        {offerSave && <SaveBooking />}
      </div>
    );
  }

  const status = booking.status;
  const holding = status === "pending" && holdLeft > 0;

  return (
    <div className="booking-page">
      <a className="back-link" href={href("showtime", showtime._id)}>
        <ArrowLeft size={16} aria-hidden="true" /> Seats
      </a>
      <article
        className={phase === "flipping" ? "ticket full checkout ticket-flip out" : "ticket full checkout"}
        onAnimationEnd={() => phase === "flipping" && setPhase("ticket")}
      >
        <div className="ticket-main">
          <Poster title={movie.title} genre={movie.genre} size="small" />
          <div className="ticket-body">
            <p className="ticket-kind">Checkout</p>
            <h1>{movie.title}</h1>
            <ul className="ticket-facts">
              <li>
                <CalendarDays size={15} aria-hidden="true" /> {longDate(showtime.startTime)}
              </li>
              <li>
                <MapPin size={15} aria-hidden="true" /> {showtime.screen.cinema?.name ?? "Cinema"} · Screen {showtime.screen.screenNumber}
              </li>
              <li>
                <Armchair size={15} aria-hidden="true" />
                <span className="seat-tags">
                  {[...booking.seats].sort().map((seat) => (
                    <span key={seat} className="seat-tag">
                      {seat}
                    </span>
                  ))}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="ticket-stub checkout-stub">
          <div className="ticket-amount">
            <span>Total</span>
            <strong>{money(booking.totalPrice)}</strong>
          </div>
          {holding && (
            <p className={holdLeft < 60 ? "hold-clock urgent" : "hold-clock"} aria-live="off">
              <Clock size={16} aria-hidden="true" /> Seats held for <strong>{clock(holdLeft)}</strong>
            </p>
          )}
        </div>

        <div className="checkout-pay">
          {holding && phase === "checkout" && <PayPalButton bookingId={booking._id} onPaid={onPaid} />}
          {phase === "flipping" && (
            <p className="ticket-status done">
              <ShieldCheck size={16} aria-hidden="true" /> Paid
            </p>
          )}
          {status === "pending" && !holding && (
            <div className="checkout-ended">
              <p className="ticket-status muted">
                <Clock size={16} aria-hidden="true" /> The hold ended and the seats went back
              </p>
              <a className="button secondary" href={href("showtime", showtime._id)}>
                <Armchair size={16} aria-hidden="true" /> Pick seats again
              </a>
            </div>
          )}
          {status === "needs_review" && (
            <p className="ticket-status">
              <ShieldCheck size={16} aria-hidden="true" /> Your payment is being checked · you'll be refunded if anything is wrong
            </p>
          )}
          {["cancelled", "expired", "refunded"].includes(status) && (
            <p className="ticket-status muted">This booking is {status}</p>
          )}
          {holding && <p className="checkout-note muted">PayPal Sandbox · no real money is charged</p>}
        </div>
      </article>
    </div>
  );
};
