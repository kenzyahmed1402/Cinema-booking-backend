import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidTimeZone, localParts, zonedTime } from "../utils/timezone.js";

describe("time zone helpers", () => {
  it("convert local times to UTC across daylight saving and month ends", () => {
    const utc = (local, zone) => zonedTime(local, zone).toISOString();
    assert.equal(utc({ year: 2026, month: 7, day: 1, hour: 19, minute: 30 }, "Europe/London"), "2026-07-01T18:30:00.000Z");
    assert.equal(utc({ year: 2026, month: 1, day: 15, hour: 19, minute: 30 }, "Europe/London"), "2026-01-15T19:30:00.000Z");
    assert.equal(utc({ year: 2026, month: 1, day: 15, hour: 19 }, "America/New_York"), "2026-01-16T00:00:00.000Z");
    // Day 32 of January is 1 February
    assert.equal(utc({ year: 2026, month: 1, day: 32, hour: 12 }, "UTC"), "2026-02-01T12:00:00.000Z");

    // Round trip in the default cinema time zone, in and out of summer time
    for (const month of [1, 4, 7, 10]) {
      const local = { year: 2026, month, day: 15, hour: 19, minute: 45 };
      const { year, month: m, day, hour, minute } = localParts(zonedTime(local, "Africa/Cairo"), "Africa/Cairo");
      assert.deepEqual({ year, month: m, day, hour, minute }, local);
    }
  });

  it("recognise valid and invalid time zones", () => {
    assert.equal(isValidTimeZone("Africa/Cairo"), true);
    assert.equal(isValidTimeZone("Mars/Olympus_Mons"), false);
  });
});
