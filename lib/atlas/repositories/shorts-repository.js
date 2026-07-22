import { readJson, writeJson } from "@/lib/data-store";

const FILE = "shorts.json";

export function getShortsData() {
  const data = readJson(FILE);
  data.drafts = data.drafts || [];
  return data;
}

export function saveShortsData(data) {
  writeJson(FILE, data);
}

export function listShortDrafts() {
  return getShortsData().drafts;
}

export function existingShortIds() {
  return getShortsData().drafts.map((d) => d.shortId);
}

// Save a shorts draft. One draft per (articleId + generation) — re-generating
// for the same article creates a new shortId via the campaign engine.
export function saveShortDraft(draft) {
  const data = getShortsData();
  const idx = data.drafts.findIndex((d) => d.shortId === draft.shortId);
  if (idx >= 0) data.drafts[idx] = draft;
  else data.drafts.push(draft);
  saveShortsData(data);
  return draft;
}

export function getShortDraftsByArticle(articleId) {
  return getShortsData().drafts.filter((d) => d.articleId === articleId);
}
