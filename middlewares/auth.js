import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';

// Tokens are always HS256. Verification only accepts HS256, whatever
// algorithm a token's header claims, so the header can't choose how it's checked.
const JWT_ALGORITHM = 'HS256';

// The web app's login: an HTTP-only cookie, so page scripts can never read
// the token. SameSite=Strict keeps other sites' pages from sending it, which
// also protects against cross-site request forgery. API clients and tests
// can keep sending the token as a Bearer header instead.
export const SESSION_COOKIE = 'seatora_session';

const cookieOptions = () => ({
  httpOnly: true,
  // Over HTTPS only, except when developing on http://localhost
  secure: process.env.NODE_ENV !== 'development',
  sameSite: 'strict',
  path: '/',
});

// A cookie's value from a Cookie header, if there is one
const cookieValue = (header, name) => {
  const pair = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : undefined;
};

// Visitors who haven't logged in get a random ID in their own cookie, so
// their chat with the assistant can be kept and moved to their account when
// they log in. It identifies a browser, never a person, and lasts a day.
export const VISITOR_COOKIE = 'seatora_visitor';
const VISITOR_DAY_MS = 24 * 60 * 60 * 1000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const visitorId = (req) => {
  const value = cookieValue(req.headers.cookie, VISITOR_COOKIE);
  return value && uuidPattern.test(value) ? value : undefined;
};

// The visitor's ID, creating it (and its cookie) on first use
export const ensureVisitorId = (req, res) => {
  const existing = visitorId(req);
  if (existing) return existing;
  const created = randomUUID();
  res.cookie(VISITOR_COOKIE, created, { ...cookieOptions(), maxAge: VISITOR_DAY_MS });
  return created;
};

export const clearVisitor = (res) => {
  res.clearCookie(VISITOR_COOKIE, cookieOptions());
};

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// The token a request carries: a Bearer header, else the session cookie
const requestToken = (req) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    return req.headers.authorization.split(' ')[1];
  }
  return cookieValue(req.headers.cookie, SESSION_COOKIE);
};

// The logged-in user, or a 401 explaining why not
const userFromRequest = async (req) => {
  const token = requestToken(req);

  if (!token) {
    throw new AppError('You are not logged in. Please log in to get access.', 401);
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  const user = await User.findById(decoded.id);

  if (!user) {
    throw new AppError('The user belonging to this token no longer exists.', 401);
  }

  return user;
};

export const protect = catchAsync(async (req, res, next) => {
  req.user = await userFromRequest(req);
  next();
});

// For routes open to everyone: req.user is the logged-in user, or null for a
// visitor (including one whose login has expired)
export const identify = catchAsync(async (req, res, next) => {
  req.user = requestToken(req) ? await userFromRequest(req).catch(() => null) : null;
  next();
});

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new AppError('You do not have permission to perform this action', 403);
    }
    next();
  };
};

export const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  user.password = undefined;

  // The cookie lasts as long as the token inside it
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), expires: new Date(jwt.decode(token).exp * 1000) });

  res.status(statusCode).json({
    status: 'success',
    token,
    data: { user },
  });
};

// Ends the browser's session by deleting the cookie. A copied token stays
// valid until it expires; rotate JWT_SECRET to end every session at once.
export const clearSession = (res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
};
