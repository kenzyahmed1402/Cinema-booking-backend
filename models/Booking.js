import mongoose from 'mongoose';

// Row letter + seat number 1-99, no leading zeros (A01 would be a second A1)
export const seatPattern = /^[A-Z][1-9]\d?$/;

// Most seats in one booking, and most active seats one customer can hold for
// a showtime (stops one account from booking a whole showing)
export const MAX_SEATS = 10;

// pending: seats held until holdExpiresAt while the customer pays
// confirmed: paid; expired: the hold ran out unpaid; cancelled: called off
// refunded: paid, then cancelled with a refund
// needs_review: something doesn't add up (e.g. paid after the hold ran out)
export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'expired', 'refunded', 'needs_review'];

// Bookings in these states keep their seats on the showtime. needs_review
// keeps them until someone has looked at it.
export const SEAT_HOLDING_STATUSES = ['pending', 'confirmed', 'needs_review'];

export const holdsSeats = (status) => SEAT_HOLDING_STATUSES.includes(status);

// Bookings with a payment behind them. They are never deleted, and their
// seats, showtime and price never change.
export const PAID_STATUSES = ['confirmed', 'needs_review', 'refunded'];

// The only status change the API accepts, for customers and admins alike:
// cancelling an unpaid booking. Every other status is set by the server
// itself: confirmed and refunded by the payment flow, expired when a hold
// runs out, needs_review when a payment doesn't add up.
export const API_STATUS_CHANGES = { pending: ['cancelled'] };

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Booking user is required'],
    },
    showtime: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Showtime',
      required: [true, 'Showtime reference is required'],
    },
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: [100, 'Customer name cannot exceed 100 characters'],
    },
    customerEmail: {
      type: String,
      required: [true, 'Customer email is required'],
      trim: true,
      lowercase: true,
      maxlength: [254, 'Customer email cannot exceed 254 characters'],
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
    },
    seats: {
      type: [String],
      required: [true, 'Seats are required'],
      validate: {
        validator: function (seats) {
          return (
            Array.isArray(seats) &&
            seats.length > 0 &&
            seats.every((seat) => seatPattern.test(seat))
          );
        },
        message:
          'Seats must be a non-empty array of seat codes like A1, B12',
      },
    },
    totalPrice: {
      type: Number,
      required: [true, 'Total price is required'],
      min: [0, 'Total price cannot be negative'],
    },
    status: {
      type: String,
      enum: {
        values: BOOKING_STATUSES,
        message: `Status must be one of: ${BOOKING_STATUSES.join(', ')}`,
      },
      default: 'pending',
    },
    // When an unpaid (pending) booking gives its seats back
    holdExpiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

bookingSchema.index({ showtime: 1, status: 1 });
bookingSchema.index({ customerEmail: 1 });
bookingSchema.index({ user: 1 });
// Finding pending bookings whose hold has run out
bookingSchema.index({ status: 1, holdExpiresAt: 1 });

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;
