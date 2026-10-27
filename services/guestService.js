import { randomBytes, randomUUID } from "node:crypto";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";

// Days an unused guest account is kept
export const GUEST_DAYS = 7;

// A new guest account. Its email and password are random and never shown:
// the guest is logged in only through the session cookie. The .invalid
// domain can never receive mail.
export const createGuest = () =>
  User.create({
    name: "Guest",
    email: `guest-${randomUUID()}@guest.invalid`,
    password: randomBytes(32).toString("hex"),
    isGuest: true,
    guestExpiresAt: new Date(Date.now() + GUEST_DAYS * 24 * 60 * 60 * 1000),
  });

// Keeps a guest account that has started using the app, e.g. by booking
export const keepGuest = async (user) => {
  if (user.isGuest && user.guestExpiresAt) {
    await User.updateOne({ _id: user._id }, { $unset: { guestExpiresAt: 1 } });
  }
};

// Turns a guest account into a normal one with the guest's own name, email
// and password, keeping its bookings
export const upgradeGuest = async (user, { name, email, password }) => {
  if (!user.isGuest) {
    throw new AppError("This is already a full account", 409);
  }
  const account = await User.findById(user._id).select("+password");
  account.set({ name, email, password, isGuest: false, guestExpiresAt: undefined });
  await account.save();
  account.password = undefined;
  return account;
};
