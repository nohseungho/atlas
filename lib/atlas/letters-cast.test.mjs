import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  CHARACTERS, CHARACTER_IDS, BASELINE_WEEK_START, SERIES,
  seoulWeekStart, weekOrdinal, castFor, castForWeek, castFromRecord,
  faceLockDirective, buildLettersBlock, checkHeroCharacter, readPackageHeroCharacterId,
} from "./letters-cast.js";
import { buildHandoffRequest } from "./chatgpt-handoff.js";

// ─── Seoul week boundary ─────────────────────────────────────────────────────

test("seoulWeekStart snaps to the Monday of the Asia/Seoul week", () => {
  // Mon 2026-08-10 00:00 KST is Sun 2026-08-09 15:00 UTC.
  assert.equal(seoulWeekStart("2026-08-09T15:00:00Z"), "2026-08-10");
  assert.equal(seoulWeekStart("2026-08-13T04:00:00Z"), "2026-08-10"); // Thu KST
  assert.equal(seoulWeekStart("2026-08-16T14:59:59Z"), "2026-08-10"); // Sun 23:59 KST
  assert.equal(seoulWeekStart("2026-08-16T15:00:00Z"), "2026-08-17"); // Mon 00:00 KST
});

test("a UTC instant that is still Sunday in UTC but Monday in Seoul belongs to the new week", () => {
  // Sun 2026-08-16 16:00 UTC = Mon 2026-08-17 01:00 KST.
  assert.equal(seoulWeekStart("2026-08-16T16:00:00Z"), "2026-08-17");
});

test("seoulWeekStart returns empty for an unparseable date instead of guessing now", () => {
  assert.equal(seoulWeekStart("not-a-date"), "");
  assert.equal(castForWeek("not-a-date"), null);
});

test("weekOrdinal counts whole weeks from the baseline, negative before it", () => {
  assert.equal(weekOrdinal(BASELINE_WEEK_START), 0);
  assert.equal(weekOrdinal("2026-08-17"), 1);
  assert.equal(weekOrdinal("2026-09-07"), 4);
  assert.equal(weekOrdinal("2026-08-03"), -1);
});

// ─── The rotation ────────────────────────────────────────────────────────────

test("baseline week 2026-08-10: 미지 asks, 스오 answers, hero is 미지", () => {
  const cast = castForWeek("2026-08-12T09:00:00+09:00");
  assert.equal(cast.weekStart, "2026-08-10");
  assert.equal(cast.weekEnd, "2026-08-16");
  assert.equal(cast.requester, "miji");
  assert.equal(cast.responder, "suo");
  assert.equal(cast.heroCharacterId, "miji");
  assert.equal(cast.masterFileName, "ATLAS-MIJI-MASTER.png");
  assert.equal(cast.masterAssetPath, "public/atlas/characters/ATLAS-MIJI-MASTER.png");
  assert.equal(cast.label, "미지 → 스오");
  assert.equal(cast.series, SERIES);
});

test("next week 2026-08-17: the roles swap — 스오 asks, 미지 answers, hero is 스오", () => {
  const cast = castForWeek("2026-08-17T00:00:00+09:00");
  assert.equal(cast.weekStart, "2026-08-17");
  assert.equal(cast.weekEnd, "2026-08-23");
  assert.equal(cast.requester, "suo");
  assert.equal(cast.responder, "miji");
  assert.equal(cast.heroCharacterId, "suo");
  assert.equal(cast.masterFileName, "ATLAS-SUO-MASTER.png");
  assert.equal(cast.label, "스오 → 미지");
});

test("the swap happens exactly at Monday 00:00 Asia/Seoul, not at UTC midnight", () => {
  assert.equal(castForWeek("2026-08-16T23:59:59+09:00").requester, "miji");
  assert.equal(castForWeek("2026-08-17T00:00:00+09:00").requester, "suo");
});

test("the rotation keeps alternating in both directions", () => {
  const requesters = [
    "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07",
  ].map((d) => castForWeek(`${d}T00:00:00+09:00`).requester);
  assert.deepEqual(requesters, ["miji", "suo", "miji", "suo", "miji"]);
  // Weeks before the anchor resolve too, rather than collapsing onto miji.
  assert.equal(castForWeek("2026-08-03T00:00:00+09:00").requester, "suo");
});

test("the hero is always that week's requester", () => {
  for (const d of ["2026-08-10", "2026-08-17", "2026-08-24", "2026-11-30"]) {
    const cast = castForWeek(`${d}T12:00:00+09:00`);
    assert.equal(cast.heroCharacterId, cast.requester);
    assert.equal(cast.masterFileName, CHARACTERS[cast.requester].masterFileName);
  }
});

test("re-running the same request never changes the character", () => {
  // A cast frozen onto a job in the 미지 week re-hydrates as 미지 even when it is
  // re-exported weeks later, when the live rotation points at 스오.
  const frozen = castForWeek("2026-08-12T00:00:00+09:00");
  assert.equal(castForWeek("2026-08-19T00:00:00+09:00").requester, "suo");
  const rehydrated = castFromRecord(frozen);
  assert.deepEqual(rehydrated, frozen);
  assert.equal(rehydrated.heroCharacterId, "miji");
  // And it is stable across repeated re-hydration.
  assert.deepEqual(castFromRecord(rehydrated), frozen);
});

test("castFromRecord refuses a record with no usable character", () => {
  assert.equal(castFromRecord(null), null);
  assert.equal(castFromRecord({ requester: "", weekStart: "2026-08-10" }), null);
  assert.equal(castFromRecord({ requester: "ghost", weekStart: "2026-08-10" }), null);
  assert.equal(castFor({ requesterId: "miji", weekStart: "nope" }), null);
});

// ─── Face lock + request payload ─────────────────────────────────────────────

test("faceLockDirective forbids changing the face and allows outfit/expression/place", () => {
  const d = faceLockDirective("suo");
  assert.equal(d.referenceFile, "ATLAS-SUO-MASTER.png");
  const locked = d.mustNotChange.join(" ");
  for (const part of ["얼굴", "눈매", "코", "입", "얼굴형"]) assert.ok(locked.includes(part), part);
  const changeable = d.mayChange.join(" ");
  for (const part of ["의상", "표정", "장소"]) assert.ok(changeable.includes(part), part);
  assert.ok(d.forbidden.some((f) => /different (model|person)/i.test(f)));
  assert.equal(faceLockDirective("ghost"), null);
});

test("the request JSON carries series, roles, master file and the face-lock rule", () => {
  const cast = castForWeek("2026-08-12T00:00:00+09:00");
  const req = buildHandoffRequest({
    jobId: "pjob_020",
    blog: { id: "blog_001", name: "ATLAS Money Blog 01" },
    candidate: { id: "kw_x", keyword: "trip delay insurance" },
    cast,
  });
  assert.equal(req.series, "ATLAS Letters");
  assert.equal(req.requester, "miji");
  assert.equal(req.responder, "suo");
  assert.equal(req.heroCharacterId, "miji");
  assert.equal(req.masterFileName, "ATLAS-MIJI-MASTER.png");
  assert.equal(req.masterAssetPath, "public/atlas/characters/ATLAS-MIJI-MASTER.png");
  assert.equal(req.letters.week.start, "2026-08-10");
  assert.equal(req.letters.faceLock.referenceFile, "ATLAS-MIJI-MASTER.png");
  assert.equal(req.letters.packageMustEcho.heroCharacterId, "miji");
  // Both character sheets travel with the request, so the responder is drawn
  // from the same fixed face whenever they appear.
  assert.deepEqual(Object.keys(req.letters.characters).sort(), ["miji", "suo"]);
  assert.ok(/heroCharacterId/.test(req.note));
  // Still secret-free.
  assert.ok(!/access_token|refresh_token|CLOUDINARY_URL/i.test(JSON.stringify(req)));
});

test("buildLettersBlock returns null for a missing cast rather than a half-filled block", () => {
  assert.equal(buildLettersBlock(null), null);
});

// ─── Import guard ────────────────────────────────────────────────────────────

test("a package for a different character is blocked with a clear reason", () => {
  const r = checkHeroCharacter({ expected: "miji", received: "suo" });
  assert.equal(r.ok, false);
  assert.equal(r.expected, "miji");
  assert.equal(r.received, "suo");
  assert.ok(r.message.includes("미지"));
  assert.ok(r.message.includes("스오"));
  assert.ok(r.message.includes("ATLAS-MIJI-MASTER.png"));
});

test("a package that dropped the character binding is blocked, not waved through", () => {
  const r = checkHeroCharacter({ expected: "suo", received: "" });
  assert.equal(r.ok, false);
  assert.ok(r.message.includes("(없음)"));
});

test("a matching package passes, and a job with no Letters binding is not checked", () => {
  assert.equal(checkHeroCharacter({ expected: "miji", received: "miji" }).ok, true);
  // art_001~013 jobs carry no cast — the guard must not retroactively block them.
  const legacy = checkHeroCharacter({ expected: "", received: "" });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.skipped, true);
});

test("readPackageHeroCharacterId accepts the shapes a package may use, and never invents one", () => {
  assert.equal(readPackageHeroCharacterId({ heroCharacterId: "miji" }), "miji");
  assert.equal(readPackageHeroCharacterId({ characterId: " suo " }), "suo");
  assert.equal(readPackageHeroCharacterId({ letters: { heroCharacterId: "miji" } }), "miji");
  assert.equal(readPackageHeroCharacterId({}), "");
});

// ─── Master assets ───────────────────────────────────────────────────────────

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("both master photos exist in the repo as real, uncompressed-by-us PNGs", () => {
  for (const id of CHARACTER_IDS) {
    const file = path.join(repoRoot, CHARACTERS[id].masterAssetPath);
    assert.ok(fs.existsSync(file), `${CHARACTERS[id].masterAssetPath} is missing`);
    const buf = fs.readFileSync(file);
    // PNG magic bytes — proof the copy is the original container, not a re-encode
    // to some other format on the way in.
    assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.ok(buf.length > 100 * 1024, `${id} master looks truncated (${buf.length} bytes)`);
  }
});

test("the two masters are distinct files (one face each, not the same image twice)", () => {
  const digests = CHARACTER_IDS.map((id) =>
    crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, CHARACTERS[id].masterAssetPath))).digest("hex"),
  );
  assert.equal(new Set(digests).size, CHARACTER_IDS.length);
});
