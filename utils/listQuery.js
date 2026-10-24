import mongoose from "mongoose";
import AppError from "./AppError.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const positiveInt = (value, name, fallback) => {
  if (value === undefined) {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new AppError(`${name} must be a whole number of at least 1`, 400);
  }
  return number;
};

// ?page=2&limit=20 -> { page, limit, skip }. limit is capped at MAX_LIMIT.
export const getPagination = (query) => {
  const page = positiveInt(query.page, "page", 1);
  const limit = Math.min(positiveInt(query.limit, "limit", DEFAULT_LIMIT), MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
};

// Filter values from the query string. Each returns undefined when the
// parameter wasn't sent, and throws 400 when it's invalid.
export const idFilter = (query, name) => {
  const value = query[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !mongoose.Types.ObjectId.isValid(value)) {
    throw new AppError(`${name} must be a valid ObjectId`, 400);
  }
  return value;
};

export const enumFilter = (query, name, allowed) => {
  const value = query[name];
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) {
    throw new AppError(`${name} must be one of ${allowed.join(", ")}`, 400);
  }
  return value;
};

// ?date=2030-03-01 -> that whole day in UTC
export const dayFilter = (query, name) => {
  const value = query[name];
  if (value === undefined) return undefined;
  const start = new Date(`${value}T00:00:00.000Z`);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(start)) {
    throw new AppError(`${name} must be a date like 2030-03-01`, 400);
  }
  return { $gte: start, $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

// ?from=2030-03-01T18:00:00Z -> a Date. Any date-time JavaScript can read.
export const timeParam = (query, name) => {
  const value = query[name];
  if (value === undefined) return undefined;
  const time = new Date(value);
  if (typeof value !== "string" || value.length > 40 || isNaN(time)) {
    throw new AppError(`${name} must be a date-time like 2030-03-01T18:00:00Z`, 400);
  }
  return time;
};

// ?upcoming=true -> true; only "true" and "false" are accepted
export const booleanParam = (query, name) => {
  const value = query[name];
  if (value === undefined) return undefined;
  if (value !== "true" && value !== "false") {
    throw new AppError(`${name} must be true or false`, 400);
  }
  return value === "true";
};

// ?area=downtown -> a case-insensitive "contains" match. Special characters
// are escaped, so the text is matched literally and can't be a slow pattern.
export const textParam = (query, name, { maxLength = 100 } = {}) => {
  const value = query[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "" || value.length > maxLength) {
    throw new AppError(`${name} must be text of 1-${maxLength} characters`, 400);
  }
  return new RegExp(value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
};

// Drops filters that weren't sent
export const buildFilter = (filters) =>
  Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined));

// Fetches one page plus the total count, and sends the standard list response
export const sendPage = async (res, key, query, total, { page, limit }) => {
  const items = await query;
  res.json({
    status: "success",
    results: items.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: { [key]: items },
  });
};
