import mongoose from 'mongoose';

const screenSchema = new mongoose.Schema(
  {
    screenNumber: {
      type: Number,
      required: true,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1
    },
    cinema: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cinema',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Screen = mongoose.model('Screen', screenSchema);

export default Screen;