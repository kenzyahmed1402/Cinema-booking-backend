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
