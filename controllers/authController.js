import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import { clearSession, clearVisitor, createSendToken, visitorId } from '../middlewares/auth.js';
import { claimVisitorData } from '../services/visitorService.js';
import { createGuest, upgradeGuest } from '../services/guestService.js';

// Logs the user in: the visitor's chat and cards move to the account, then
// the session cookie is set
const logIn = async (req, res, user, statusCode) => {
  await claimVisitorData(visitorId(req), user._id);
  clearVisitor(res);
  createSendToken(user, statusCode, res);
};

export const register = catchAsync(async (req, res) => {
  const { name, email, password } = req.body;

  const user = await User.create({
    name,
    email,
    password,
  });

  await logIn(req, res, user, 201);
});

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Please provide email and password', 400);
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Incorrect email or password', 401);
  }

  await logIn(req, res, user, 200);
});

// POST /auth/guest: continue without typing anything. Creates a guest account
// and logs it in; see services/guestService.js.
export const continueAsGuest = catchAsync(async (req, res) => {
  await logIn(req, res, await createGuest(), 201);
});

// POST /auth/upgrade { name, email, password }: turns the logged-in guest
// account into a normal one, keeping its bookings
export const upgrade = catchAsync(async (req, res) => {
  createSendToken(await upgradeGuest(req.user, req.body), 200, res);
});

export const getMe = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);

  res.json({
    status: 'success',
    data: { user },
  });
});

// POST /auth/logout: removes the login cookie
export const logout = (req, res) => {
  clearSession(res);
  clearVisitor(res);
  res.status(204).send();
};
