import mongoose from 'mongoose';

export const seatPattern = /^[A-Z]\d{1,2}$/;

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
        values: ['pending', 'confirmed', 'cancelled'],
        message: 'Status must be pending, confirmed, or cancelled',
      },
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

bookingSchema.index({ showtime: 1, status: 1 });
bookingSchema.index({ customerEmail: 1 });
bookingSchema.index({ user: 1 });

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;
