// ─── ATLAS Publish Schedule (V1) ─────────────────────────────────────────────
// §8: one post per day by default, with the timezone and the publish time held
// as configuration rather than baked into the code. Pure — no IO, no @/ imports.
//
// Slots are computed in the configured LOCAL timezone (default US Eastern,
// because the audience is U.S. readers) and stored as UTC ISO strings, so a DST
// change never silently shifts the publish hour. Intl is the only dependency.

export const DEFAULT_SCHEDULE = {
  timezone: "America/New_York",
  publishHour: 9,
  publishMinute: 0,
  perDay: 1,
};

export function normalizeConfig(config = {}) {
  const c = { ...DEFAULT_SCHEDULE, ...(config || {}) };
  const hour = Number(c.publishHour);
  const minute = Number(c.publishMinute);
  const perDay = Number(c.perDay);
  return {
    timezone: String(c.timezone || DEFAULT_SCHEDULE.timezone),
    publishHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_SCHEDULE.publishHour,
    publishMinute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : DEFAULT_SCHEDULE.publishMinute,
    perDay: Number.isInteger(perDay) && perDay >= 1 && perDay <= 5 ? perDay : DEFAULT_SCHEDULE.perDay,
  };
}

export function validateConfig(config = {}) {
  const issues = [];
  const c = config || {};
  if (c.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: String(c.timezone) });
    } catch {
      issues.push(`알 수 없는 시간대: ${c.timezone}`);
    }
  }
  const int = (v) => v === undefined || (Number.isInteger(Number(v)) && String(v).trim() !== "");
  if (!int(c.publishHour) || (c.publishHour !== undefined && (c.publishHour < 0 || c.publishHour > 23))) issues.push("publishHour는 0~23 정수여야 합니다.");
  if (!int(c.publishMinute) || (c.publishMinute !== undefined && (c.publishMinute < 0 || c.publishMinute > 59))) issues.push("publishMinute는 0~59 정수여야 합니다.");
  if (!int(c.perDay) || (c.perDay !== undefined && (c.perDay < 1 || c.perDay > 5))) issues.push("perDay는 1~5 정수여야 합니다.");
  return { ok: issues.length === 0, issues };
}

// Offset (ms) of `timezone` at the given UTC instant. Positive east of UTC.
function tzOffsetMs(utcMs, timezone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return asUtc - utcMs;
}

// UTC instant for a local wall-clock time. Resolved twice so a slot that falls
// across a DST boundary lands on the correct absolute instant.
function zonedToUtcMs({ year, month, day, hour, minute }, timezone) {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstPass = naive - tzOffsetMs(naive, timezone);
  return naive - tzOffsetMs(firstPass, timezone);
}

// Local calendar date (Y/M/D) of a UTC instant, in the configured timezone.
export function localDateParts(utcMs, timezone) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

export function localDateKey(iso, timezone) {
  const ms = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const { year, month, day } = localDateParts(ms, timezone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays({ year, month, day }, n) {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + n);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * The next free publish slot at or after `from`.
 *
 * A day is full once `perDay` posts are already scheduled (or were published)
 * on that local date — that is the "하루 1개" rule, enforced on data rather
 * than on the user remembering. Returns an ISO-8601 UTC string.
 *
 * @param takenAt ISO strings already scheduled/published
 */
export function nextSlot({ from = new Date().toISOString(), takenAt = [], config = {} } = {}) {
  const cfg = normalizeConfig(config);
  const fromMs = typeof from === "number" ? from : Date.parse(from);
  if (!Number.isFinite(fromMs)) throw new Error(`nextSlot: 잘못된 기준 시각 ${from}`);

  const counts = new Map();
  for (const t of takenAt || []) {
    const key = localDateKey(t, cfg.timezone);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }

  let date = localDateParts(fromMs, cfg.timezone);
  // 400 days is a hard stop so a misconfigured perDay can never spin forever.
  for (let i = 0; i < 400; i += 1) {
    const key = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
    const used = counts.get(key) || 0;
    if (used < cfg.perDay) {
      // Space multiple same-day posts one hour apart so they never collide.
      const slotMs = zonedToUtcMs(
        { ...date, hour: cfg.publishHour, minute: cfg.publishMinute },
        cfg.timezone,
      ) + used * 60 * 60 * 1000;
      if (slotMs > fromMs) return new Date(slotMs).toISOString();
    }
    date = addDays(date, 1);
  }
  throw new Error("nextSlot: 400일 내에 사용 가능한 발행 슬롯이 없습니다.");
}

// Is a scheduled post due yet? Publishing itself still requires the approval
// gate — this only answers "has its time arrived".
export function isDue(scheduledAt, now = new Date().toISOString()) {
  const s = Date.parse(scheduledAt);
  const n = typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(s) || !Number.isFinite(n)) return false;
  return s <= n;
}

// Human-readable slot, in the configured timezone.
export function formatSlot(iso, config = {}) {
  const cfg = normalizeConfig(config);
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: cfg.timezone,
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(ms));
}

/**
 * Plan the next N slots for a queue of approved articles. Used by the
 * "승인 및 예약" action so the user sees the whole publishing calendar from one
 * click instead of scheduling posts one at a time.
 */
export function planSchedule({ articleIds = [], from = new Date().toISOString(), takenAt = [], config = {} } = {}) {
  const cfg = normalizeConfig(config);
  const taken = [...(takenAt || [])];
  const plan = [];
  for (const articleId of articleIds) {
    const at = nextSlot({ from, takenAt: taken, config: cfg });
    plan.push({ articleId, scheduledAt: at, display: formatSlot(at, cfg) });
    taken.push(at);
  }
  return { config: cfg, plan };
}
