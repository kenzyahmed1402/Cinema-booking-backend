import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidTimeZone, localParts, zonedTime } from "../utils/timezone.js";

describe("time zone helpers", () => {
  it("converts a local time to UTC in summer and winter", () => {
    assert.equal(
      zonedTime({ year: 2026, month: 7, day: 1, hour: 19, minute: 30 }, "Europe/London").toISOString(),
      "2026-07-01T18:30:00.000Z"
    );
    assert.equal(
      zonedTime({ year: 2026, month: 1, day: 15, hour: 19, minute: 30 }, "Europe/London").toISOString(),
      "2026-01-15T19:30:00.000Z"
    );
    assert.equal(
      zonedTime({ year: 2026, month: 1, day: 15, hour: 19 }, "America/New_York").toISOString(),
      "2026-01-16T00:00:00.000Z"
    );
  });

  it("rolls an overflowing day into the next month", () => {
    assert.equal(
      zonedTime({ year: 2026, month: 1, day: 32, hour: 12 }, "UTC").toISOString(),
      "2026-02-01T12:00:00.000Z"
    );
  });

  it("round-trips local times in the default cinema time zone", () => {
    for (const month of [1, 4, 7, 10]) {
      const local = { year: 2026, month, day: 15, hour: 19, minute: 45 };
      const parts = localParts(zonedTime(local, "Africa/Cairo"), "Africa/Cairo");
      assert.deepEqual(
        { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute },
        local
      );
    }
  });

  it("recognises valid and invalid time zones", () => {
    assert.equal(isValidTimeZone("Africa/Cairo"), true);
    assert.equal(isValidTimeZone("Mars/Olympus_Mons"), false);
  });
});
