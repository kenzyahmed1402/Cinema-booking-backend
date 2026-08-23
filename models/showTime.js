import mongoose from 'mongoose';

const showtimeSchema = new mongoose.Schema(
  {
    movie: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Movie',
      required: [true, 'Movie reference is required'],
    },
    screen: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Screen',
      required: [true, 'Screen reference is required'],
    },
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    bookedSeats: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

showtimeSchema.index({ screen: 1, startTime: 1 }, { unique: true });
showtimeSchema.index({ movie: 1, startTime: 1 });

showtimeSchema.virtual('availableSeats').get(function () {
  return this.screen?.capacity - this.bookedSeats.length;
});

showtimeSchema.set('toJSON', { virtuals: true });
showtimeSchema.set('toObject', { virtuals: true });

const Showtime = mongoose.model('Showtime', showtimeSchema);

export default Showtime;
