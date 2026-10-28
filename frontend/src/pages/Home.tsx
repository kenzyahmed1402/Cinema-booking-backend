import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Armchair,
  CalendarDays,
  Clock,
  CreditCard,
  Film,
  MapPin,
  MessageCircle,
  Sparkles,
  Ticket,
} from "lucide-react";
import { api, errorMessage } from "../api";
import type { Movie, Showtime } from "../types";
import { dayLabel, localDay, money, runtime, time } from "../format";
import { go, href } from "../route";
import { Poster } from "../components/Poster";
import { CinemaHall, type SeatState } from "../components/CinemaHall";

const HEADLINE = ["Your", "seat", "is", "waiting."];

const POINTS = [
  { icon: MessageCircle, text: "Tell the assistant what you feel like" },
  { icon: Film, text: "It finds the film and picks seats" },
  { icon: CreditCard, text: "You confirm and pay with PayPal" },
];

const SUGGESTIONS = ["Sci-fi tonight for two", "Something funny tomorrow", "Downtown this weekend"];

const STEPS = [
  { icon: MessageCircle, title: "Ask", text: "Mood, day, how many seats" },
  { icon: Armchair, title: "Pick seats", text: "See the hall, choose your row" },
  { icon: Ticket, title: "Pay", text: "PayPal, then your ticket" },
];

// The home hall is a preview: a fixed pattern of taken seats and two
// picked ones in the middle of row E
const previewSeat = (row: string, seat: number): SeatState => {
  if (row === "E" && (seat === 6 || seat === 7)) return "picked";
  const r = row.charCodeAt(0) - 65;
  return (r * 5 + seat * 7) % 9 < 3 ? "taken" : "free";
};

// The public home page: the hall, the assistant, what's on
export const Home = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [showtimes, setShowtimes] = useState<Showtime[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<string>("");
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ movies: Movie[] }>("GET", "/movies?limit=100"),
      api<{ showtimes: Showtime[] }>("GET", "/showTimes?upcoming=true&limit=100"),
    ])
      .then(([m, s]) => {
        setMovies(m.movies);
        setShowtimes(s.showtimes);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  // Showtimes per local day, in order
  const days = useMemo(() => {
    const byDay = new Map<string, Showtime[]>();
    for (const showtime of showtimes) {
      const key = localDay(new Date(showtime.startTime));
      byDay.set(key, [...(byDay.get(key) ?? []), showtime]);
    }
    return [...byDay.entries()];
  }, [showtimes]);

  const selectedDay = day || days[0]?.[0] || "";
  const dayShowtimes = days.find(([key]) => key === selectedDay)?.[1] ?? [];

  // Movies playing soonest first: the ones to recommend
  const recommended = useMemo(() => {
    const firstShow = new Map<string, number>();
    for (const showtime of showtimes) {
      if (!firstShow.has(showtime.movie._id)) firstShow.set(showtime.movie._id, new Date(showtime.startTime).getTime());
    }
    return [...movies]
      .filter((movie) => firstShow.has(movie._id))
      .sort((a, b) => firstShow.get(a._id)! - firstShow.get(b._id)!);
  }, [movies, showtimes]);

  // The day's showtimes grouped by movie
  const byMovie = useMemo(() => {
    const groups = new Map<string, { movie: Movie; showtimes: Showtime[] }>();
    for (const showtime of dayShowtimes) {
      const group = groups.get(showtime.movie._id) ?? { movie: showtime.movie, showtimes: [] };
      group.showtimes.push(showtime);
      groups.set(showtime.movie._id, group);
    }
    return [...groups.values()];
  }, [dayShowtimes]);

  // A recommended movie: show the first day it plays, scrolled to it
  const showMovie = (movieId: string) => {
    const first = showtimes.find((showtime) => showtime.movie._id === movieId);
    if (!first) return;
    setDay(localDay(new Date(first.startTime)));
    requestAnimationFrame(() =>
      document.getElementById(`movie-${movieId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  };

  const ask = (event?: FormEvent, text = prompt) => {
    event?.preventDefault();
    if (text.trim()) go("chat", undefined, { q: text.trim() });
  };

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-visual">
          <CinemaHall rows={8} seatsPerRow={12} stateOf={previewSeat} label="Preview of a cinema hall with two seats picked in row E" />
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

        <div className="hero-text">
          <p className="eyebrow rise">
            <Sparkles size={14} aria-hidden="true" /> AI cinema concierge
          </p>
          {/* Each word rises in turn; the words stay plain text for screen readers */}
          <h1>
            {HEADLINE.map((word, i) => (
              <Fragment key={word}>
                {i > 0 && " "}
                <span className="w">
                  <span>{word}</span>
                </span>
              </Fragment>
            ))}
          </h1>
          <ul className="points rise">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon size={18} aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
          <form className="prompt rise" onSubmit={ask}>
            <Sparkles className="prompt-icon" size={18} aria-hidden="true" />
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A thriller tomorrow night, two seats"
              aria-label="Ask the assistant"
              maxLength={1000}
            />
            <button type="submit" className="button primary" disabled={!prompt.trim()}>
              Ask <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>
          <div className="chips rise">
            {SUGGESTIONS.map((text) => (
              <button key={text} type="button" className="chip" onClick={() => ask(undefined, text)}>
                {text}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && <p className="loading">Loading what's on…</p>}

      {recommended.length > 0 && (
        <section>
          <h2 className="section-title">
            <Film size={20} aria-hidden="true" /> Now showing
          </h2>
          <div className="poster-row">
            {recommended.map((movie) => (
              <button key={movie._id} type="button" className="movie-tile glow" onClick={() => showMovie(movie._id)}>
                <Poster title={movie.title} genre={movie.genre} />
                <span className="movie-meta">
                  <Clock size={14} aria-hidden="true" /> {runtime(movie.duration)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {days.length > 0 && (
        <section>
          <h2 className="section-title">
            <CalendarDays size={20} aria-hidden="true" /> Showtimes
          </h2>
          <div className="tabs days" role="tablist" aria-label="Day">
            {days.map(([key]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={key === selectedDay}
                className={key === selectedDay ? "tab active" : "tab"}
                onClick={() => setDay(key)}
              >
                {dayLabel(key)}
              </button>
            ))}
          </div>

          <div className="listing">
            {byMovie.map(({ movie, showtimes: times }) => (
              <article key={movie._id} id={`movie-${movie._id}`} className="listing-item card glow">
                <Poster title={movie.title} size="small" />
                <div className="listing-body">
                  <h3>{movie.title}</h3>
                  <ul className="meta">
                    <li>
                      <Film size={14} aria-hidden="true" /> {movie.genre}
                    </li>
                    <li>
                      <Clock size={14} aria-hidden="true" /> {runtime(movie.duration)}
                    </li>
                  </ul>
                  {movie.description && <p className="description">{movie.description}</p>}
                  <div className="times">
                    {times.map((showtime) => (
                      <a key={showtime._id} className="time-chip" href={href("showtime", showtime._id)}>
                        <strong>{time(showtime.startTime)}</strong>
                        <span>
                          <MapPin size={12} aria-hidden="true" />
                          {showtime.screen.cinema.name.replace("CineMate ", "")}
                        </span>
                        <span>
                          <Armchair size={12} aria-hidden="true" />
                          {showtime.availableSeats} left · {money(showtime.price)}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="steps-title">
        <h2 id="steps-title" className="section-title">
          <Ticket size={20} aria-hidden="true" /> How it works
        </h2>
        <ol className="steps">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="card glow">
              <span className="step-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <span className="step-number">{i + 1}</span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
};
