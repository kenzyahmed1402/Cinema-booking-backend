import { Armchair, CalendarDays, Check, MapPin, Ticket } from "lucide-react";
import { longDate, money } from "../format";
import type { BookingDetail } from "../types";
import { Poster } from "./Poster";
import { QrCode } from "./QrCode";

// A short, readable booking reference from the booking's ID
export const ticketReference = (id: string) => `ST-${id.slice(-8).toUpperCase()}`;

// Where the QR code leads: this booking's page, which only its owner can open
export const ticketLink = (id: string) => `${window.location.origin}/#/booking/${id}`;

// The paid ticket. It is also what prints: the print stylesheet shows only
// the element marked .printable.
export const TicketCard = ({ booking }: { booking: BookingDetail }) => {
  const { showtime } = booking;
  const { movie } = showtime;
  const reference = ticketReference(booking._id);
  return (
    <article className="ticket full final printable" aria-label={`Ticket for ${movie.title}`}>
      <div className="ticket-main">
        <Poster title={movie.title} genre={movie.genre} size="small" />
        <div className="ticket-body">
          <p className="ticket-kind">
            <Ticket size={14} aria-hidden="true" /> Admit {booking.seats.length}
          </p>
          <h2>{movie.title}</h2>
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
      <div className="ticket-stub final-stub">
        <QrCode text={ticketLink(booking._id)} label={`QR code for booking ${reference}`} />
        <dl className="ticket-ref">
          <dt>Reference</dt>
          <dd>{reference}</dd>
          <dt>Paid</dt>
          <dd>{money(booking.totalPrice)}</dd>
          <dd className="ticket-status done">
            <Check size={15} aria-hidden="true" /> PayPal
          </dd>
        </dl>
      </div>
    </article>
  );
};
