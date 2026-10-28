import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api";
import type { Movie, Showtime } from "../types";
import { dayLabel, localDay, money, runtime, time } from "../format";
import { go, href } from "../route";
import { Poster } from "../components/Poster";

const HEADLINE = ["What", "do", "you", "feel", "like", "watching?"];

const SUGGESTIONS = [
  "A sci-fi movie tonight for two",
  "Something funny tomorrow evening",
  "What's on downtown this weekend?",
];

// The public home page: ask the assistant, see what's on
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
        <p className="eyebrow rise">AI cinema concierge</p>
        {/* Each word rises in turn; the words stay plain text for screen readers */}
        <h1>
          {HEADLINE.map((word, i) => (
            <Fragment key={word}>
              {i > 0 && " "}
              <span className={i === HEADLINE.length - 1 ? "w accent" : "w"}>
                <span>{word}</span>
              </span>
            </Fragment>
          ))}
        </h1>
        <p className="lead rise">Tell CineMate the mood, the day and how many seats. It finds the showtime, picks seats and prepares the booking. You confirm and pay with PayPal.</p>
        <form className="prompt rise" onSubmit={ask}>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A thriller tomorrow night downtown, two seats"
            aria-label="Ask the assistant"
            maxLength={1000}
          />
          <button type="submit" className="button primary" disabled={!prompt.trim()}>
            Ask
          </button>
        </form>
        <div className="chips rise">
          {SUGGESTIONS.map((text) => (
            <button key={text} type="button" className="chip" onClick={() => ask(undefined, text)}>
              {text}
            </button>
          ))}
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
          <h2 className="section-title">Recommended now</h2>
          <div className="poster-row">
            {recommended.map((movie) => (
              <button key={movie._id} type="button" className="movie-tile glow" onClick={() => showMovie(movie._id)}>
                <Poster title={movie.title} genre={movie.genre} />
                <span className="movie-meta">
                  {movie.genre} · {runtime(movie.duration)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {days.length > 0 && (
        <section>
          <h2 className="section-title">Showtimes</h2>
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
                  <p className="muted">
                    {movie.genre} · {runtime(movie.duration)}
                  </p>
                  {movie.description && <p className="description">{movie.description}</p>}
                  <div className="times">
                    {times.map((showtime) => (
                      <a key={showtime._id} className="time-chip" href={href("showtime", showtime._id)}>
                        <strong>{time(showtime.startTime)}</strong>
                        <span>{showtime.screen.cinema.name.replace("CineMate ", "")}</span>
                        <span>
                          {money(showtime.price)} · {showtime.availableSeats} left
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
    </div>
  );
};
