import mongoose from 'mongoose';

// Request counts for the rate limits (see utils/rateLimitStore.js), shared by
// every running instance of the app. The _id is the limit's prefix plus a
// hash of the client's IP, so IPs are never stored in readable form.
const rateLimitSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
    },
    hits: {
      type: Number,
      required: true,
    },
    // When the current window ends. MongoDB deletes the count afterwards
    // (TTL index), usually within a minute.
    resetAt: {
      type: Date,
      required: true,
      expires: 0,
    },
  },
  {
    versionKey: false,
  }
);

const RateLimit = mongoose.model('RateLimit', rateLimitSchema);

export default RateLimit;
