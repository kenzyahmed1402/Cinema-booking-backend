import { createHash } from "node:crypto";
import RateLimit from "../models/RateLimit.js";

// A store for express-rate-limit that keeps the counts in MongoDB, so every
// running instance of the app shares them. On Vercel, in-memory counts would
// be kept per instance and start from zero whenever a new one starts.
//
// Each change is a single update on the server, using the database's clock,
// so simultaneous requests and instances with different clocks can't miscount.
// A count from an ended window is ignored even before MongoDB deletes it.
export class MongoRateLimitStore {
  localKeys = false;

  // Decrements still being written, per key. express-rate-limit takes back a
  // successful request's hit after the response is sent; the next request
  // from the same client waits for that, so it can't be counted too early.
  pending = new Map();

  constructor(prefix) {
    this.prefix = prefix;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  id(key) {
    return this.prefix + createHash("sha256").update(key).digest("hex");
  }

  async get(key) {
    const count = await RateLimit.collection.findOne({
      _id: this.id(key),
      $expr: { $gt: ["$resetAt", "$$NOW"] },
    });
    return count ? { totalHits: count.hits, resetTime: count.resetAt } : undefined;
  }

  async increment(key) {
    await this.pending.get(key);
    const active = { $gt: ["$resetAt", "$$NOW"] };
    const count = await RateLimit.collection.findOneAndUpdate(
      { _id: this.id(key) },
      [
        {
          $set: {
            hits: { $cond: [active, { $add: ["$hits", 1] }, 1] },
            resetAt: { $cond: [active, "$resetAt", { $add: ["$$NOW", this.windowMs] }] },
          },
        },
      ],
      { upsert: true, returnDocument: "after" }
    );
    return { totalHits: count.hits, resetTime: count.resetAt };
  }

  async decrement(key) {
    const update = RateLimit.collection.updateOne(
      { _id: this.id(key), hits: { $gt: 0 }, $expr: { $gt: ["$resetAt", "$$NOW"] } },
      { $inc: { hits: -1 } }
    );
    const settled = update.then(() => {}, () => {});
    this.pending.set(key, settled);
    settled.then(() => {
      if (this.pending.get(key) === settled) this.pending.delete(key);
    });
    await update;
  }

  async resetKey(key) {
    await RateLimit.collection.deleteOne({ _id: this.id(key) });
  }
}
