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
export const SESSION_COOKIE = 'cinemate_session';

const cookieOptions = () => ({
  httpOnly: true,
  // Over HTTPS only, except when developing on http://localhost
  secure: process.env.NODE_ENV !== 'development',
  sameSite: 'strict',
  path: '/',
});

// The session cookie's value from a Cookie header, if there is one
const sessionCookie = (header) => {
  const pair = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return pair ? pair.slice(SESSION_COOKIE.length + 1) : undefined;
};

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

export const protect = catchAsync(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else {
    token = sessionCookie(req.headers.cookie);
  }

  if (!token) {
    throw new AppError('You are not logged in. Please log in to get access.', 401);
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  const user = await User.findById(decoded.id);

  if (!user) {
    throw new AppError('The user belonging to this token no longer exists.', 401);
  }

  req.user = user;
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
