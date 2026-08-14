import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema(
  {
    showtime: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Showtime',
      required: true,
    },
    customerName: {
      type: String,
      required: true,
      
    },
    customerEmail: {
      type: String,
      required: true,
    },
    seats: {
      type: [String],
      required: true,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0, 
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      
    },
  },
  {
    timestamps: true,
  }
);

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;