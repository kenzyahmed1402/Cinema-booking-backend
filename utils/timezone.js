// Cinema showtimes are planned in local time (e.g. "19:30 in Cairo") but
// stored in UTC. These helpers convert between the two for an IANA time
// zone such as "Africa/Cairo", including daylight saving changes.

export const DEFAULT_TIME_ZONE = "Africa/Cairo";

export const isValidTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

// The wall-clock date and time in `timeZone` at the moment `date`
export const localParts = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type).value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
};

// Milliseconds the zone is ahead of UTC at the moment `ms`
const offsetAt = (ms, timeZone) => {
  const p = localParts(new Date(ms), timeZone);
  const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return localAsUtc - Math.floor(ms / 1000) * 1000;
};

// The UTC moment of a wall-clock time in `timeZone`. Day overflow is
// allowed, e.g. day 32 of January is 1 February.
export const zonedTime = ({ year, month, day, hour = 0, minute = 0 }, timeZone) => {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const first = asUtc - offsetAt(asUtc, timeZone);
  // Recheck at the result in case a daylight saving change lies in between
  return new Date(asUtc - offsetAt(first, timeZone));
};
