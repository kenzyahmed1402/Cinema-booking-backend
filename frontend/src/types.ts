// The API's data as the web app uses it

export type User = {
  _id: string;
  name: string;
  email: string;
  role: "CUSTOMER" | "ADMIN";
  isGuest?: boolean;
};

export type Movie = {
  _id: string;
  title: string;
  genre: string;
  duration: number;
  description?: string;
  language?: string;
};

export type Cinema = {
  _id: string;
  name: string;
  location: string;
};

export type Screen = {
  _id: string;
  screenNumber: number;
  rows: number;
  seatsPerRow: number;
  capacity: number;
  cinema: Cinema;
};

// A showtime as GET /showTimes lists it: with its movie, screen and cinema
export type Showtime = {
  _id: string;
  startTime: string;
  price: number;
  availableSeats: number;
  movie: Movie;
  screen: Screen;
};

// GET /showTimes/:id/seats: rows A.. and seats 1..; `taken` is booked or held
export type SeatMap = {
  showtime: string;
  rows: number | null;
  seatsPerRow: number | null;
  taken: string[];
  available: number;
};

// A card the assistant proposes; nothing happens until the customer confirms
export type BookingCard = {
  type: "booking";
  proposal: string;
  showtime: string;
  movie?: string;
  genre?: string;
  cinema?: string;
  screen?: number;
  startTime: string;
  localTime: string;
  seats: string[];
  totalCents: number;
  currency: string;
  expiresAt: string;
};

export type CancellationCard = {
  type: "cancellation";
  proposal: string;
  booking: string;
  movie?: string;
  genre?: string;
  cinema?: string;
  startTime: string;
  localTime: string;
  seats: string[];
  paidCents: number;
  refundCents: number;
  refundPercent: number;
  currency: string;
  policy: string;
  expiresAt: string;
};

export type ProposalCard = BookingCard | CancellationCard;

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  cards?: ProposalCard[];
  at?: string;
};

// GET /agent/proposals/:id
export type Proposal = {
  id: string;
  kind: "booking" | "cancellation";
  status: "open" | "confirming" | "confirmed";
  expiresAt: string;
  result?: string;
};

// The booking a confirmed card made or cancelled
export type Booking = {
  _id: string;
  seats: string[];
  status: string;
  totalPrice: number;
  holdExpiresAt?: string;
};

// GET /bookings/:id: a booking with its showtime, movie, screen and cinema
export type BookingDetail = {
  _id: string;
  seats: string[];
  totalPrice: number;
  status: "pending" | "confirmed" | "cancelled" | "expired" | "refunded" | "needs_review";
  holdExpiresAt?: string;
  showtime: {
    _id: string;
    startTime: string;
    price: number;
    movie: Movie;
    screen: { screenNumber: number; cinema?: Cinema };
  };
};

// A PayPal payment as the API records it
export type Payment = {
  _id: string;
  paypalOrderId: string;
  status: string;
  amountCents: number;
  currency: string;
};
