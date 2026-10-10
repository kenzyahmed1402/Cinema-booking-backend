import mongoose from 'mongoose';

const screenSchema = new mongoose.Schema(
  {
    screenNumber: {
      type: Number,
      required: [true, 'Screen number is required'],
      min: [1, 'Screen number must be at least 1'],
    },
    // Seat layout: rows A-Z and numbered seats, e.g. 10 x 12 = A1 to J12.
    // Older screens may only have a capacity.
    rows: {
      type: Number,
      min: [1, 'Rows must be at least 1'],
      max: [26, 'Rows cannot exceed 26 (A-Z)'],
      validate: { validator: Number.isInteger, message: 'Rows must be a whole number' },
    },
    seatsPerRow: {
      type: Number,
      min: [1, 'Seats per row must be at least 1'],
      max: [99, 'Seats per row cannot exceed 99'],
      validate: { validator: Number.isInteger, message: 'Seats per row must be a whole number' },
    },
    // Calculated from rows x seatsPerRow by the controller
    capacity: {
      type: Number,
      required: [true, 'Screen capacity is required'],
      min: [1, 'Capacity must be at least 1'],
    },
    cinema: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cinema',
      required: [true, 'Cinema reference is required'],
    },
  },
  {
    timestamps: true,
  }
);

screenSchema.index({ cinema: 1, screenNumber: 1 }, { unique: true });

const Screen = mongoose.model('Screen', screenSchema);

export default Screen;
