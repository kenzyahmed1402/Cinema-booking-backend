// The one cancellation policy, used by the quote, the cancel endpoint and
// anything that explains it:
//
//   24 hours or more before the show: 100% refund
//   2 to 24 hours before the show:     50% refund
//   less than 2 hours before:          can't be cancelled
//
// Half of an odd number of cents is rounded down.

const HOUR = 60 * 60 * 1000;

export const CANCELLATION_POLICY = [
  { minHoursBefore: 24, refundPercent: 100 },
  { minHoursBefore: 2, refundPercent: 50 },
];

export const POLICY_TEXT =
  "Full refund 24 hours or more before the show, 50% from 2 to 24 hours before, no cancellation in the last 2 hours.";

// What cancelling a paid booking of `paidCents` for a show starting at
// `startTime` refunds right now
export const quoteCancellation = ({ startTime, paidCents, now = new Date() }) => {
  const hoursBefore = (new Date(startTime).getTime() - now.getTime()) / HOUR;
  const tier = CANCELLATION_POLICY.find((t) => hoursBefore >= t.minHoursBefore);

  if (!tier) {
    return { allowed: false, refundPercent: 0, refundCents: 0, reason: "The show starts in less than 2 hours" };
  }
  return {
    allowed: true,
    refundPercent: tier.refundPercent,
    refundCents: Math.floor((paidCents * tier.refundPercent) / 100),
  };
};
