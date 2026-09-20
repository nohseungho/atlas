// ATLAS Letters (V1) — the shared exchange diary between 미지 and 수호.
//
// From this point on a new ATLAS guide is written as one week of a two-person
// correspondence: one of them asks, the other answers, and the roles swap every
// Monday 00:00 Asia/Seoul. That rotation is TEXT ONLY. The hero image of a global
// (Blogger) article always shows 미지, rendered from her fixed master photo — the
// channel lock in character-channel-policy.js forbids 수호 on the global channel.
// (Until 2026-09-20 the hero followed the requester, which put 수호 on the
// global post published in a 수호-asks week; that is the defect this fixes.)
//
// This module is PURE (no IO, no @/ imports) so both the API routes and the
// client screens can share one source of truth, and every rule below is
// unit-testable without a server. It owns three things:
//   1. the two character definitions + their master asset paths
//   2. the weekly rotation (which is frozen onto a job once its request exists)
//   3. the face-lock directive that ships inside the ChatGPT request file
//
// No paid API is involved: the master images are repo assets, and the directive
// is text the human carries into ChatGPT alongside the request file.

export const SERIES = "ATLAS Letters";
export const SERIES_ID = "atlas-letters";

// Repo-relative path of the untouched master photos. Byte-identical to the
// originals — they are the reference every hero image is generated from, so a
// re-encode/resize would move the face they exist to pin down.
export const MASTER_DIR = "public/atlas/characters";

// The rotation anchor. Week of 2026-08-10 (Mon) Asia/Seoul: 미지 asks, 수호
// answers. Every later week alternates from here; earlier weeks alternate
// backwards, so a date before the anchor still resolves deterministically.
export const BASELINE_WEEK_START = "2026-08-10";
export const BASELINE_REQUESTER = "miji";

// The only character allowed in a global (Blogger) hero image. Mirrors
// ATLAS_CHANNELS.global_blogger.characterId in character-channel-policy.js.
export const GLOBAL_HERO_ID = "miji";

// Facial geometry is the identity: it is what must survive from the master into
// every generated image. Clothing, expression and setting are the parts a
// weekly article is allowed to change.
export const FACE_LOCKED = [
  "얼굴 (face — overall likeness must match the master photo exactly)",
  "눈매 (eye shape, eyelid line, eye spacing, iris color)",
  "코 (nose bridge, tip, width)",
  "입 (mouth shape, lip thickness, lip line)",
  "얼굴형 (face shape, jawline, cheekbones)",
];

export const FACE_CHANGEABLE = [
  "의상 (clothing / outfit)",
  "표정 (expression — within the same face, no change to the underlying features)",
  "장소 (location / background / lighting)",
];

// Character sheets. The descriptions restate what the master photo shows so the
// generator has the likeness in words as well as in the reference image; they
// are never a licence to deviate from the file itself.
export const CHARACTERS = {
  miji: {
    id: "miji",
    name: "Miji",
    nameKo: "미지",
    displayName: "미지 (Miji)",
    role: "ATLAS Letters correspondent",
    gender: "female",
    masterFileName: "ATLAS-MIJI-MASTER.png",
    masterAssetPath: `${MASTER_DIR}/ATLAS-MIJI-MASTER.png`,
    publicUrl: "/atlas/characters/ATLAS-MIJI-MASTER.png",
    appearance:
      "Korean woman in her 30s. Long dark-brown wavy hair with a slightly off-centre part, " +
      "falling forward over one shoulder. Warm brown almond-shaped eyes with a soft double eyelid, " +
      "straight narrow nose, gently smiling closed lips, oval face with a soft jawline. " +
      "Clear natural-toned makeup.",
    voice:
      "Writes the letter that asks: brings the trip, the worry and the concrete question, " +
      "in plain first-person English.",
  },
  // 내부 id "suo"와 마스터 파일명 ATLAS-SUO-MASTER.png는 기존 데이터·이미지
  // 호환을 위해 그대로 둔다. 사람이 보는 이름은 언제나 수호 (Suho)다.
  suo: {
    id: "suo",
    name: "Suho",
    nameKo: "수호",
    displayName: "수호 (Suho)",
    role: "ATLAS Letters correspondent",
    gender: "male",
    masterFileName: "ATLAS-SUO-MASTER.png",
    masterAssetPath: `${MASTER_DIR}/ATLAS-SUO-MASTER.png`,
    publicUrl: "/atlas/characters/ATLAS-SUO-MASTER.png",
    // 2026-09-20: the realistic photo previously stored as ATLAS-SUO-MASTER.png was archived; the
    // master is now the confirmed anime-style Suho (see character-channel-policy.js). Suho is a
    // text-only correspondent on the global channel — the pictured hero is always 미지.
    appearance:
      "Young Korean man drawn in a warm anime illustration style: tousled dark-brown hair, " +
      "large dark eyes, bright friendly smile, dark green knit sweater.",
    voice:
      "Writes the letter that answers: takes the question apart, gives the numbers and the " +
      "steps, and says plainly what is still unknown.",
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);

// 화면·본문·프롬프트에 인물을 적을 때는 내부 id("suo")나 저장된 옛 라벨이 아니라
// 항상 이 두 함수를 거친다. 그래야 id 호환을 유지하면서도 노출되는 이름은
// 수호 (Suho) 하나로 고정된다.
export function characterDisplayName(characterId) {
  return CHARACTERS[characterId]?.displayName || String(characterId || "");
}

/** cast에 저장된 label 대신 지금 기준의 표시 이름으로 다시 만든 "A → B". */
export function castDisplayLabel(cast) {
  if (!cast) return "";
  const a = characterDisplayName(cast.requester);
  const b = characterDisplayName(cast.responder);
  return a && b ? `${a} → ${b}` : a || b;
}

// Korea has been UTC+9 with no DST since 1988, so a fixed offset is exact here
// (and unlike Intl parsing it works identically in Node and in the browser).
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? NaN : parsed;
}

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Midnight of the Monday that opens the Seoul week containing `date`, as a
// YYYY-MM-DD calendar date. Returns "" for an unparseable input rather than
// silently falling back to "now" — a caller must not get a cast for a week it
// did not ask about.
export function seoulWeekStart(date = new Date()) {
  const ms = toMs(date);
  if (Number.isNaN(ms)) return "";
  // Shift into Seoul local time so UTC getters read as Seoul wall-clock values.
  const shifted = ms + SEOUL_OFFSET_MS;
  const daysSinceMonday = (new Date(shifted).getUTCDay() + 6) % 7; // Sun=0 → 6
  return isoDate(shifted - daysSinceMonday * DAY_MS);
}

// Whole weeks between a week-start and the baseline. Negative before it.
export function weekOrdinal(weekStart) {
  const start = Date.parse(`${weekStart}T00:00:00+09:00`);
  const base = Date.parse(`${BASELINE_WEEK_START}T00:00:00+09:00`);
  if (Number.isNaN(start) || Number.isNaN(base)) return NaN;
  return Math.round((start - base) / WEEK_MS);
}

export function otherCharacterId(characterId) {
  return characterId === "miji" ? "suo" : characterId === "suo" ? "miji" : "";
}

// Builds the cast for an explicit (requester, week) pair. Used both by the
// weekly rotation and when re-hydrating the cast frozen onto an existing job.
export function castFor({ requesterId, weekStart }) {
  const requester = CHARACTERS[requesterId];
  const responder = CHARACTERS[otherCharacterId(requesterId)];
  const start = Date.parse(`${weekStart}T00:00:00+09:00`);
  if (!requester || !responder || Number.isNaN(start)) return null;
  return {
    series: SERIES,
    seriesId: SERIES_ID,
    weekStart,
    weekEnd: isoDate(start + 6 * DAY_MS + SEOUL_OFFSET_MS),
    timezone: "Asia/Seoul",
    requester: requester.id,
    responder: responder.id,
    // The pictured presenter is fixed to the global channel's character (미지)
    // regardless of who asks this week — 수호 exists in the letter text only.
    heroCharacterId: GLOBAL_HERO_ID,
    masterFileName: CHARACTERS[GLOBAL_HERO_ID].masterFileName,
    masterAssetPath: CHARACTERS[GLOBAL_HERO_ID].masterAssetPath,
    heroLock: "global_blogger:miji",
    label: `${requester.nameKo} → ${responder.nameKo}`,
  };
}

// The rotation itself: 미지 asks on the baseline week, and the pair swaps every
// Monday 00:00 Asia/Seoul thereafter.
export function castForWeek(date = new Date()) {
  const weekStart = seoulWeekStart(date);
  const ordinal = weekOrdinal(weekStart);
  if (!weekStart || Number.isNaN(ordinal)) return null;
  const even = ((ordinal % 2) + 2) % 2 === 0;
  const requesterId = even ? BASELINE_REQUESTER : otherCharacterId(BASELINE_REQUESTER);
  return castFor({ requesterId, weekStart });
}

// Re-hydrates a cast previously frozen onto a production job. The STORED
// requester wins over the rotation: once a request file exists for a job, the
// person on its hero image is settled, and re-exporting it in a later week must
// return the same character rather than whoever the rotation points at now.
export function castFromRecord(record) {
  if (!record) return null;
  return castFor({ requesterId: record.requester, weekStart: record.weekStart });
}

// The face-lock instruction carried into ChatGPT with the request file.
export function faceLockDirective(characterId) {
  const c = CHARACTERS[characterId];
  if (!c) return null;
  return {
    rule:
      `Use ${c.masterFileName} as the identity reference for every image showing ${c.displayName}. ` +
      "The face must be the same person in every image, matching the master photo.",
    mustNotChange: FACE_LOCKED,
    mayChange: FACE_CHANGEABLE,
    referenceFile: c.masterFileName,
    referencePath: c.masterAssetPath,
    forbidden: [
      "Do not generate a different model / a different person.",
      "Do not restyle, age, slim, or beautify the face.",
      "Do not crop the face out to avoid matching it.",
    ],
  };
}

// The whole ATLAS Letters block that goes into the request JSON.
export function buildLettersBlock(cast) {
  if (!cast) return null;
  const requester = CHARACTERS[cast.requester];
  const responder = CHARACTERS[cast.responder];
  return {
    series: cast.series,
    seriesId: cast.seriesId,
    format: "shared exchange diary — one letter asks, one letter answers",
    week: { start: cast.weekStart, end: cast.weekEnd, timezone: cast.timezone },
    rotation: "roles swap every Monday 00:00 Asia/Seoul",
    label: cast.label,
    requester: cast.requester,
    responder: cast.responder,
    heroCharacterId: cast.heroCharacterId,
    heroRule: "The featured image shows this week's requester.",
    masterFileName: cast.masterFileName,
    masterAssetPath: cast.masterAssetPath,
    characters: {
      [requester.id]: { ...requester, weekRole: "requester" },
      [responder.id]: { ...responder, weekRole: "responder" },
    },
    faceLock: faceLockDirective(cast.heroCharacterId),
    packageMustEcho: {
      heroCharacterId: cast.heroCharacterId,
      note: `The returned atlas-package MUST carry heroCharacterId: "${cast.heroCharacterId}". A package with any other character id is rejected on import.`,
    },
  };
}

// Import guard. `expected` is the character frozen onto the job; `received` is
// whatever the returned package echoed back. A job with no Letters binding
// (every article up to art_013) is not subject to this check at all.
export function checkHeroCharacter({ expected, received }) {
  const want = String(expected || "").trim();
  if (!want) return { ok: true, skipped: true };
  const got = String(received || "").trim();
  if (got === want) return { ok: true, skipped: false };
  const wantName = CHARACTERS[want]?.displayName || want;
  const gotName = got ? CHARACTERS[got]?.displayName || got : "(없음)";
  return {
    ok: false,
    skipped: false,
    expected: want,
    received: got,
    message:
      `이 Job의 ATLAS Letters 대표 인물은 ${wantName}(heroCharacterId: ${want})입니다. ` +
      `받은 패키지의 인물은 ${gotName} — 같은 인물(${CHARACTERS[want]?.masterFileName || want})로 다시 만들어 ` +
      "같은 jobId로 등록하세요.",
  };
}

// Reads the package's echoed character id, accepting the two shapes a returned
// package plausibly uses. Never guesses one when the field is absent — a
// missing echo must fail the guard, not pass it.
export function readPackageHeroCharacterId(pkg) {
  return String(pkg?.heroCharacterId || pkg?.characterId || pkg?.letters?.heroCharacterId || "").trim();
}
