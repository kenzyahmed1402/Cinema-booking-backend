import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import { clearSession, createSendToken } from '../middlewares/auth.js';

export const register = catchAsync(async (req, res) => {
  const { name, email, password } = req.body;

  const user = await User.create({
    name,
    email,
    password,
  });

  createSendToken(user, 201, res);
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

  createSendToken(user, 200, res);
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
  res.status(204).send();
};
