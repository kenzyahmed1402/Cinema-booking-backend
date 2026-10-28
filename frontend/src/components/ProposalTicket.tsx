import { useEffect, useState } from "react";
import {
  ArrowRight,
  Armchair,
  CalendarDays,
  Check,
  CircleAlert,
  Clock,
  LoaderCircle,
  MapPin,
  Ticket,
  TicketX,
} from "lucide-react";
import { api } from "../api";
import { money } from "../format";
import { clock, useSecondsLeft } from "../hooks";
import type { Booking, ProposalCard, SeatMap } from "../types";
import { CinemaHall } from "./CinemaHall";
import { Poster } from "./Poster";

// What the page knows about a card: the server's word on its status, and
// what happened when the customer pressed Confirm
export type CardState = {
  status: "loading" | "open" | "confirmed" | "expired";
  booking?: Booking;
  busy?: boolean;
  error?: string;
};

type Props = {
  card: ProposalCard;
  state: CardState;
  onConfirm: (card: ProposalCard) => void;
  // compact: a short ticket in the conversation, opened in the side panel
  variant: "full" | "compact";
  selected?: boolean;
  onSelect?: () => void;
};

const cents = (value: number) => money(value / 100);

// The hall with the card's seats picked, from the showtime's live seat map
const TicketHall = ({ showtime, seats }: { showtime: string; seats: string[] }) => {
  const [map, setMap] = useState<SeatMap | null>(null);
  useEffect(() => {
    api<{ seatMap: SeatMap }>("GET", `/showTimes/${showtime}/seats`)
      .then((data) => setMap(data.seatMap))
      .catch(() => setMap(null));
  }, [showtime]);

  if (!map?.rows || !map.seatsPerRow) return null;
  const picked = new Set(seats);
  const taken = new Set(map.taken);
  return (
    <CinemaHall
      className="ticket-hall"
      rows={map.rows}
      seatsPerRow={map.seatsPerRow}
      stateOf={(row, seat) => (picked.has(`${row}${seat}`) ? "picked" : taken.has(`${row}${seat}`) ? "taken" : "free")}
      label={`Seats ${seats.join(", ")} in the hall`}
    />
  );
};

export const ProposalTicket = ({ card, state, onConfirm, variant, selected, onSelect }: Props) => {
  const booking = card.type === "booking";
  const offerLeft = useSecondsLeft(state.status === "open" ? card.expiresAt : undefined);
  const holdLeft = useSecondsLeft(state.booking?.holdExpiresAt);
  const status = state.status === "open" && offerLeft === 0 ? "expired" : state.status;

  const facts = (
    <ul className="ticket-facts">
      <li>
        <CalendarDays size={15} aria-hidden="true" /> {card.localTime}
      </li>
      {card.cinema && (
        <li>
          <MapPin size={15} aria-hidden="true" /> {card.cinema}
          {booking && card.screen ? ` · Screen ${card.screen}` : ""}
        </li>
      )}
      <li>
        <Armchair size={15} aria-hidden="true" />
        <span className="seat-tags">
          {card.seats.map((seat) => (
            <span key={seat} className="seat-tag">
              {seat}
            </span>
          ))}
        </span>
      </li>
    </ul>
  );

  const amount = booking ? (
    <div className="ticket-amount">
      <span>Total</span>
      <strong>{cents(card.totalCents)}</strong>
    </div>
  ) : (
    <div className="ticket-amount">
      <span>Refund · {card.refundPercent}%</span>
      <strong>{cents(card.refundCents)}</strong>
    </div>
  );

  const action = (() => {
    if (status === "loading") {
      return (
        <p className="ticket-status">
          <LoaderCircle className="spin" size={16} aria-hidden="true" /> Checking…
        </p>
      );
    }
    if (status === "expired") {
      return (
        <p className="ticket-status muted">
          <Clock size={16} aria-hidden="true" /> Expired · ask again
        </p>
      );
    }
    if (status === "confirmed") {
      return (
        <p className="ticket-status done">
          <Check size={16} aria-hidden="true" />
          {booking
            ? state.booking?.holdExpiresAt && holdLeft > 0
              ? `Seats held · pay within ${clock(holdLeft)}`
              : "Seats held · see My bookings"
            : "Cancelled · refund on its way"}
        </p>
      );
    }
    return (
      <button type="button" className="button primary" disabled={state.busy} onClick={() => onConfirm(card)}>
        {state.busy ? (
          <LoaderCircle className="spin" size={16} aria-hidden="true" />
        ) : booking ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <TicketX size={16} aria-hidden="true" />
        )}
        {booking ? "Confirm seats" : "Confirm cancellation"}
      </button>
    );
  })();

  const kind = (
    <p className={booking ? "ticket-kind" : "ticket-kind cancel"}>
      {booking ? <Ticket size={14} aria-hidden="true" /> : <TicketX size={14} aria-hidden="true" />}
      {booking ? "Booking" : "Cancellation"}
    </p>
  );

  if (variant === "compact") {
    return (
      <article className={selected ? "ticket compact selected" : "ticket compact"}>
        <div className="ticket-main">
          <Poster title={card.movie ?? "Movie"} genre={card.genre} size="small" />
          <div className="ticket-body">
            {kind}
            <h3>{card.movie}</h3>
            <p className="muted ticket-line">
              {card.localTime} · {card.seats.join(", ")}
            </p>
          </div>
        </div>
        <button type="button" className="ticket-open" onClick={onSelect} aria-pressed={selected}>
          {status === "confirmed" ? "Confirmed" : status === "expired" ? "Expired" : "View"}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </article>
    );
  }

  return (
    <article className="ticket full">
      <div className="ticket-main">
        <Poster title={card.movie ?? "Movie"} genre={card.genre} size="small" />
        <div className="ticket-body">
          {kind}
          <h3>{card.movie}</h3>
          {facts}
        </div>
      </div>

      {booking && status !== "expired" && <TicketHall showtime={card.showtime} seats={card.seats} />}
      {!booking && <p className="ticket-policy muted">{card.policy}</p>}

      <div className="ticket-stub">
        {amount}
        <div className="ticket-action">
          {action}
          {status === "open" && !state.busy && (
            <p className="ticket-note">
              <Clock size={13} aria-hidden="true" /> Confirm within {clock(offerLeft)}
            </p>
          )}
        </div>
      </div>

      {state.error && (
        <p className="ticket-error" role="alert">
          <CircleAlert size={15} aria-hidden="true" /> {state.error}
        </p>
      )}
    </article>
  );
};
