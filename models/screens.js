import mongoose from 'mongoose';

const screenSchema = new mongoose.Schema(
  {
    screenNumber: {
      type: Number,
      required: [true, 'Screen number is required'],
      min: [1, 'Screen number must be at least 1'],
    },
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
