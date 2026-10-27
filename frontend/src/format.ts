// Showtimes are planned in the cinemas' time zone; every time on screen is
// shown in it, wherever the visitor is
export const CINEMA_TIME_ZONE: string = import.meta.env.VITE_CINEMA_TZ ?? "Africa/Cairo";

export const money = (dollars: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(dollars);

export const time = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: CINEMA_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso)
  );

// The cinemas' local date of a moment, as YYYY-MM-DD
export const localDay = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: CINEMA_TIME_ZONE }).format(date);

// "Today", "Tomorrow" or "Thu 30 Oct" for a YYYY-MM-DD local day
export const dayLabel = (day: string, now = new Date()) => {
  if (day === localDay(now)) return "Today";
  if (day === localDay(new Date(now.getTime() + 24 * 60 * 60 * 1000))) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${day}T12:00:00Z`)
  );
};

export const runtime = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
