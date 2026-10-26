import Booking, { BOOKING_STATUSES } from "../models/Booking.js";
import Payment from "../models/Payment.js";
import Movie, { allowedGenres } from "../models/movies.js";
import Showtime from "../models/showTime.js";
import AgentProposal, { PROPOSAL_MINUTES } from "../models/AgentProposal.js";
import AppError from "../utils/AppError.js";
import { checkFields } from "../middlewares/validateRequest.js";
import { bookingSchema } from "../validators/bookingValidator.js";
import { textParam } from "../utils/listQuery.js";
import { DEFAULT_TIME_ZONE } from "../utils/timezone.js";
import { findShowtimes, showtimeFilter } from "./showtimeService.js";
import { cancellationQuoteFor, paidBookingFor, quoteSeats } from "./bookingService.js";

// The only things the assistant can do. Read tools look things up; the two
// propose tools only save a card that the customer confirms with a click
// (POST /agent/proposals/:id/confirm). No tool reserves seats, takes money or
// cancels anything.
//
// The user is always the logged-in one, passed in by the server, never taken
// from the model. The assistant acts as a customer even for admins: it only
// sees the user's own bookings and payments, and the customer limits apply.

const MAX_RESULTS = 20;
const MINUTE = 60 * 1000;

const timeZone = () => process.env.CINEMA_TZ || DEFAULT_TIME_ZONE;

// "Sat 1 Nov, 19:30" in the cinemas' time zone, alongside the UTC time
const localTime = (date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone(),
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

const asCustomer = (user) => ({ _id: user._id, name: user.name, email: user.email, role: "CUSTOMER" });

const showtimeSummary = (showtime) => ({
  showtime: String(showtime._id),
  movie: showtime.movie?.title,
  genre: showtime.movie?.genre,
  durationMinutes: showtime.movie?.duration,
  cinema: showtime.screen?.cinema?.name,
  location: showtime.screen?.cinema?.location,
  screen: showtime.screen?.screenNumber,
  startTime: showtime.startTime,
  localTime: localTime(showtime.startTime),
  pricePerSeat: showtime.price,
  seatsAvailable: Math.max((showtime.screen?.capacity ?? 0) - showtime.bookedSeats.length, 0),
});

const loadShowtime = (id) =>
  Showtime.findById(id).populate("movie").populate({ path: "screen", populate: { path: "cinema" } });

const proposalExpiry = () => new Date(Date.now() + PROPOSAL_MINUTES * MINUTE);

const bookingId = { required: true, type: "ObjectId" };

// Each tool: what it does (for the model), its arguments (checked like a
// request body, unknown ones dropped) and what it runs
export const agentTools = {
  searchMovies: {
    description: "Find movies by genre and/or words in the title.",
    args: {
      genre: { type: "string", enum: allowedGenres },
      title: { type: "string", maxLength: 100 },
    },
    run: async (user, { genre, title }) => {
      const filter = {
        ...(genre && { genre }),
        ...(title && { title: textParam({ title }, "title") }),
      };
      const movies = await Movie.find(filter).sort({ title: 1 }).limit(MAX_RESULTS);
      return movies.map((movie) => ({
        movie: String(movie._id),
        title: movie.title,
        genre: movie.genre,
        durationMinutes: movie.duration,
        description: movie.description,
      }));
    },
  },

  searchShowtimes: {
    description:
      "Find upcoming showtimes. Filters: area (text in the cinema's location), cinema or movie ID, genre, " +
      "date (UTC day like 2030-03-01), from/to (date-times). Soonest first, at most 20.",
    args: {
      area: { type: "string", maxLength: 100 },
      cinema: { type: "ObjectId" },
      movie: { type: "ObjectId" },
      genre: { type: "string", enum: allowedGenres },
      date: { type: "string", maxLength: 10 },
      from: { type: "string", maxLength: 40 },
      to: { type: "string", maxLength: 40 },
    },
    run: async (user, args) => {
      const filter = await showtimeFilter({ ...args, upcoming: "true" });
      const showtimes = await findShowtimes(filter, { limit: MAX_RESULTS });
      return showtimes.map(showtimeSummary);
    },
  },

  getAvailableSeats: {
    description: "The seat layout of a showtime and which seats are taken. Rows are letters from A, seats numbers from 1.",
    args: { showtime: { required: true, type: "ObjectId" } },
    run: async (user, { showtime }) => {
      const doc = await Showtime.findById(showtime).populate("screen");
      if (!doc) {
        throw new AppError("Showtime not found", 404);
      }
      return {
        showtime: String(doc._id),
        rows: doc.screen?.rows ?? 0,
        seatsPerRow: doc.screen?.seatsPerRow ?? 0,
        taken: [...doc.bookedSeats].sort(),
        available: Math.max((doc.screen?.capacity ?? 0) - doc.bookedSeats.length, 0),
      };
    },
  },

  getBookingQuote: {
    description: "The price of seats for a showtime, calculated by the server. Reserves nothing.",
    args: bookingSchema,
    run: async (user, args) => {
      const quote = await quoteSeats(args);
      return { ...quote, showtime: String(quote.showtime) };
    },
  },

  getMyBookings: {
    description: "The customer's own bookings, newest first, at most 10. Optional status filter.",
    args: { status: { type: "string", enum: BOOKING_STATUSES } },
    run: async (user, { status }) => {
      const bookings = await Booking.find({ user: user._id, ...(status && { status }) })
        .sort({ createdAt: -1, _id: -1 })
        .limit(10)
        .populate({ path: "showtime", populate: [{ path: "movie" }, { path: "screen", populate: { path: "cinema" } }] });
      return bookings.map((booking) => ({
        booking: String(booking._id),
        status: booking.status,
        movie: booking.showtime?.movie?.title,
        cinema: booking.showtime?.screen?.cinema?.name,
        startTime: booking.showtime?.startTime,
        localTime: booking.showtime ? localTime(booking.showtime.startTime) : undefined,
        seats: [...booking.seats],
        totalPrice: booking.totalPrice,
        ...(booking.status === "pending" && { holdExpiresAt: booking.holdExpiresAt }),
      }));
    },
  },

  getPaymentStatus: {
    description: "The payment status of one of the customer's own bookings.",
    args: { booking: bookingId },
    run: async (user, { booking }) => {
      const payment = await Payment.findOne({ booking, user: user._id }).sort({ createdAt: -1 });
      if (!payment) {
        return { booking, payment: null };
      }
      return { booking, payment: { status: payment.status, amountCents: payment.amountCents, currency: payment.currency } };
    },
  },

  getCancellationQuote: {
    description: "What cancelling one of the customer's paid bookings would refund right now, under the policy.",
    args: { booking: bookingId },
    run: async (user, { booking }) => {
      const found = await paidBookingFor(asCustomer(user), booking);
      return { booking, ...cancellationQuoteFor(found.booking, found.payment) };
    },
  },

  proposeBooking: {
    description:
      "Show the customer a booking card for these seats. Reserves nothing: the customer confirms with the " +
      "card's button, and the server checks the seats and price again then.",
    args: bookingSchema,
    run: async (user, { showtime, seats }) => {
      const quote = await quoteSeats({ showtime, seats });
      const doc = await loadShowtime(showtime);
      const expiresAt = proposalExpiry();
      const card = {
        type: "booking",
        ...showtimeSummary(doc),
        seats,
        totalCents: quote.totalCents,
        currency: quote.currency,
        expiresAt,
      };
      const proposal = await AgentProposal.create({
        user: user._id,
        kind: "booking",
        showtime,
        seats,
        totalCents: quote.totalCents,
        card,
        expiresAt,
      });
      return { proposal: String(proposal._id), card };
    },
  },

  proposeCancellation: {
    description:
      "Show the customer a card for cancelling one of their paid bookings, with the refund the policy allows " +
      "now. Cancels nothing: the customer confirms with the card's button.",
    args: { booking: bookingId },
    run: async (user, { booking }) => {
      const found = await paidBookingFor(asCustomer(user), booking);
      const quote = cancellationQuoteFor(found.booking, found.payment);
      if (!quote.allowed) {
        throw new AppError(`This booking can't be cancelled any more: ${quote.reason.toLowerCase()}`, 409);
      }
      const doc = await loadShowtime(found.booking.showtime._id);
      const expiresAt = proposalExpiry();
      const card = {
        type: "cancellation",
        booking,
        movie: doc?.movie?.title,
        cinema: doc?.screen?.cinema?.name,
        startTime: found.booking.showtime.startTime,
        localTime: localTime(found.booking.showtime.startTime),
        seats: [...found.booking.seats],
        paidCents: quote.paidCents,
        refundCents: quote.refundCents,
        refundPercent: quote.refundPercent,
        currency: quote.currency,
        policy: quote.policy,
        expiresAt,
      };
      const proposal = await AgentProposal.create({
        user: user._id,
        kind: "cancellation",
        booking,
        refundCents: quote.refundCents,
        card,
        expiresAt,
      });
      return { proposal: String(proposal._id), card };
    },
  },
};

// A tool argument's rules as JSON Schema, for the model
const jsonSchema = (rules) => {
  if (rules.type === "array") {
    return { type: "array", items: { type: "string" }, ...(rules.maxLength && { maxItems: rules.maxLength }) };
  }
  if (rules.type === "ObjectId") {
    return { type: "string", description: "An ID from an earlier tool result" };
  }
  return {
    type: rules.type,
    ...(rules.enum && { enum: rules.enum }),
    ...(rules.maxLength && { maxLength: rules.maxLength }),
  };
};

// The tools as function declarations for the model
export const toolDeclarations = Object.entries(agentTools).map(([name, tool]) => ({
  name,
  description: tool.description,
  parametersJsonSchema: {
    type: "object",
    properties: Object.fromEntries(Object.entries(tool.args).map(([arg, rules]) => [arg, jsonSchema(rules)])),
    required: Object.entries(tool.args)
      .filter(([, rules]) => rules.required)
      .map(([arg]) => arg),
  },
}));

// Runs one tool for the logged-in user. Unknown tools and invalid arguments
// are refused with 400, before anything runs.
export const runTool = async (user, name, args) => {
  const tool = Object.hasOwn(agentTools, name) ? agentTools[name] : undefined;
  if (!tool) {
    throw new AppError(`Unknown tool: ${String(name).slice(0, 50)}`, 400);
  }
  const checked = checkFields(tool.args, args && typeof args === "object" && !Array.isArray(args) ? args : {});
  return tool.run(asCustomer(user), checked);
};
