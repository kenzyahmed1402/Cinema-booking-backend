import mongoose from 'mongoose';

const cinemaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Cinema name is required'],
      trim: true,
      maxlength: [100, 'Cinema name cannot exceed 100 characters'],
    },
    location: {
      type: String,
      required: [true, 'Cinema location is required'],
      trim: true,
      maxlength: [200, 'Cinema location cannot exceed 200 characters'],
    },
  },
  {
    timestamps: true,
  }
);

cinemaSchema.index({ name: 1, location: 1 });

const Cinema = mongoose.model('Cinema', cinemaSchema);

export default Cinema;
