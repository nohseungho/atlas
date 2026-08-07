// ─── Deal Hunter · 서버 저장소 ──────────────────────────────────────────────
// Source of Truth는 서버 JSON 파일이다(localStorage 아님).
// 공용 lib/data-store.js의 writeJson은 in-place 덮어쓰기라 쓰기 도중 중단되면
// 파일이 깨질 수 있어서, 여기서는 임시파일 → rename 방식으로만 저장한다.
// 공용 helper는 다른 기능이 쓰고 있으므로 건드리지 않는다.

import fs from "fs";
import path from "path";
import { findDuplicate, nextDealId } from "./deal-model.js";

const DATA_DIR = path.join(process.cwd(), "data", "atlas");
const FILE = path.join(DATA_DIR, "return-deals.json");
const EMPTY = { deals: [] };

function readRaw() {
  try {
    const raw = fs.readFileSync(FILE, "utf-8");
    const data = JSON.parse(raw);
    return { deals: Array.isArray(data?.deals) ? data.deals : [] };
  } catch (err) {
    if (err && err.code === "ENOENT") return { ...EMPTY, deals: [] };
    throw err;
  }
}

// 임시파일에 완전히 쓰고 fsync한 뒤 원자적으로 교체한다.
function writeAtomic(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, payload, "utf-8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, FILE);
}

export function listDeals() {
  return readRaw().deals;
}

export function getDeal(id) {
  return readRaw().deals.find((d) => d.id === id) || null;
}

/**
 * 중복(sourceUrl / source+sourceItemId)을 차단하고 새 deal을 저장한다.
 */
export function insertDeal(deal) {
  const data = readRaw();
  const dup = findDuplicate(data.deals, deal);
  if (dup) return { ok: false, errorCode: "DUPLICATE_DEAL", duplicateId: dup.id };
  const saved = { ...deal, id: deal.id || nextDealId(data.deals) };
  data.deals.push(saved);
  writeAtomic(data);
  return { ok: true, deal: saved };
}

export function updateDeal(id, nextDeal) {
  const data = readRaw();
  const idx = data.deals.findIndex((d) => d.id === id);
  if (idx < 0) return { ok: false, errorCode: "NOT_FOUND" };
  data.deals[idx] = { ...nextDeal, id };
  writeAtomic(data);
  return { ok: true, deal: data.deals[idx] };
}
