import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCHEDULE, normalizeConfig, validateConfig, nextSlot, isDue,
  localDateKey, formatSlot, planSchedule,
} from "./publish-schedule.js";

const TZ = DEFAULT_SCHEDULE.timezone;

test("config defaults to one post a day at a configured local time", () => {
  assert.equal(DEFAULT_SCHEDULE.perDay, 1);
  const c = normalizeConfig({});
  assert.equal(c.timezone, "America/New_York");
  assert.equal(c.publishHour, 9);
});

test("invalid config values fall back instead of scheduling nonsense", () => {
  const c = normalizeConfig({ publishHour: 99, publishMinute: -5, perDay: 0, timezone: "Asia/Seoul" });
  assert.equal(c.timezone, "Asia/Seoul");
  assert.equal(c.publishHour, DEFAULT_SCHEDULE.publishHour);
  assert.equal(c.publishMinute, DEFAULT_SCHEDULE.publishMinute);
  assert.equal(c.perDay, DEFAULT_SCHEDULE.perDay);
});

test("validateConfig reports bad timezone and out-of-range values", () => {
  assert.equal(validateConfig({ timezone: "Asia/Seoul", publishHour: 7 }).ok, true);
  assert.equal(validateConfig({ timezone: "Mars/Olympus" }).ok, false);
  assert.equal(validateConfig({ publishHour: 24 }).ok, false);
  assert.equal(validateConfig({ perDay: 9 }).ok, false);
});

test("the next slot lands on the configured local hour", () => {
  const at = nextSlot({ from: "2026-08-06T00:00:00.000Z", takenAt: [], config: { timezone: TZ, publishHour: 9 } });
  const local = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(at));
  assert.equal(local, "09:00");
});

test("a day that already has its post rolls the next one to tomorrow", () => {
  const first = nextSlot({ from: "2026-08-06T00:00:00.000Z", takenAt: [], config: { timezone: TZ } });
  const second = nextSlot({ from: "2026-08-06T00:00:00.000Z", takenAt: [first], config: { timezone: TZ } });
  assert.notEqual(localDateKey(first, TZ), localDateKey(second, TZ));
  assert.ok(Date.parse(second) > Date.parse(first));
});

test("a slot already past today rolls forward instead of scheduling in the past", () => {
  const from = "2026-08-06T20:00:00.000Z"; // 16:00 local, past the 09:00 slot
  const at = nextSlot({ from, takenAt: [], config: { timezone: TZ, publishHour: 9 } });
  assert.ok(Date.parse(at) > Date.parse(from));
  assert.equal(localDateKey(at, TZ), "2026-08-07");
});

test("perDay > 1 spaces same-day posts an hour apart", () => {
  const cfg = { timezone: TZ, publishHour: 9, perDay: 2 };
  const a = nextSlot({ from: "2026-08-06T00:00:00.000Z", takenAt: [], config: cfg });
  const b = nextSlot({ from: "2026-08-06T00:00:00.000Z", takenAt: [a], config: cfg });
  assert.equal(localDateKey(a, TZ), localDateKey(b, TZ), "both on the same local day");
  assert.equal(Date.parse(b) - Date.parse(a), 60 * 60 * 1000);

  const c = nextSlot({ from: "2026-08-06T00:00:00.000Z", takenAt: [a, b], config: cfg });
  assert.notEqual(localDateKey(c, TZ), localDateKey(a, TZ), "the third rolls to the next day");
});

test("the publish hour survives a DST transition", () => {
  const hourAt = (iso) =>
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(iso));

  const beforeDst = nextSlot({ from: "2026-10-30T00:00:00.000Z", takenAt: [], config: { timezone: TZ, publishHour: 9 } });
  const afterDst = nextSlot({ from: "2026-11-05T00:00:00.000Z", takenAt: [], config: { timezone: TZ, publishHour: 9 } });
  assert.equal(hourAt(beforeDst), "09");
  assert.equal(hourAt(afterDst), "09", "US DST ends Nov 1 2026 — the local hour must not drift");
  assert.notEqual(beforeDst.slice(11, 13), afterDst.slice(11, 13), "the UTC hour does shift");
});

test("timezone is a real setting, not a constant", () => {
  const seoul = nextSlot({ from: "2026-08-06T00:00:00.000Z", takenAt: [], config: { timezone: "Asia/Seoul", publishHour: 9 } });
  const local = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }).format(new Date(seoul));
  assert.equal(local, "09");
});

test("isDue only fires once the slot has arrived", () => {
  assert.equal(isDue("2026-08-06T13:00:00.000Z", "2026-08-06T12:59:59.000Z"), false);
  assert.equal(isDue("2026-08-06T13:00:00.000Z", "2026-08-06T13:00:00.000Z"), true);
  assert.equal(isDue("not-a-date", "2026-08-06T13:00:00.000Z"), false);
});

test("planSchedule lays out a queue one per day with no collisions", () => {
  const { plan } = planSchedule({
    articleIds: ["art_011", "art_012", "art_013"],
    from: "2026-08-06T00:00:00.000Z",
    takenAt: [],
    config: { timezone: TZ },
  });
  assert.equal(plan.length, 3);
  const days = plan.map((p) => localDateKey(p.scheduledAt, TZ));
  assert.equal(new Set(days).size, 3, "one article per local day");
  assert.deepEqual(days, [...days].sort(), "slots are in ascending order");
  assert.ok(plan.every((p) => p.display));
});

test("planSchedule respects slots that are already taken", () => {
  const taken = [nextSlot({ from: "2026-08-06T00:00:00.000Z", takenAt: [], config: { timezone: TZ } })];
  const { plan } = planSchedule({ articleIds: ["art_020"], from: "2026-08-06T00:00:00.000Z", takenAt: taken, config: { timezone: TZ } });
  assert.notEqual(localDateKey(plan[0].scheduledAt, TZ), localDateKey(taken[0], TZ));
});

test("nextSlot refuses an unparseable base time instead of guessing", () => {
  assert.throws(() => nextSlot({ from: "yesterday" }), /잘못된 기준 시각/);
  assert.equal(formatSlot("nope"), "");
});
