import { useEffect, useState } from "react";

// Whether a CSS media query matches, kept up to date
export const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
};

// Whole seconds left until a moment; ticks once a second and stops at zero
const secondsUntil = (until?: string) =>
  until ? Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000)) : 0;

export const useSecondsLeft = (until?: string) => {
  const [seconds, setSeconds] = useState(() => secondsUntil(until));
  useEffect(() => {
    setSeconds(secondsUntil(until));
    if (!until) return;
    const timer = setInterval(() => {
      const next = secondsUntil(until);
      setSeconds(next);
      if (next === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);
  return seconds;
};

export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
