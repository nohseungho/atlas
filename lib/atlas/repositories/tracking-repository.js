import { readJson, writeJson } from "@/lib/data-store";
import { importConversions } from "@/lib/atlas/tracking-engine";

const FILE = "tracking.json";

export function getTrackingData() {
  const data = readJson(FILE);
  data.campaigns = data.campaigns || [];
  data.conversions = data.conversions || [];
  data.clicks = data.clicks || [];
  data.imports = data.imports || [];
  return data;
}

export function saveTrackingData(data) {
  writeJson(FILE, data);
}

// Register campaigns produced by a shorts draft. Deterministic campaignId means
// re-registering the same tuple updates in place — never creates a duplicate.
export function registerCampaigns(campaignRows = []) {
  const data = getTrackingData();
  const byId = new Map(data.campaigns.map((c) => [c.campaignId, c]));
  for (const row of campaignRows) {
    byId.set(row.campaignId, { ...byId.get(row.campaignId), ...row });
  }
  data.campaigns = [...byId.values()];
  saveTrackingData(data);
  return data.campaigns;
}

// Import network-reported conversions with (source, actionId) dedup. Records an
// import receipt so re-imports are auditable.
export function importConversionBatch(incoming, { source = "network", label = "" } = {}) {
  const data = getTrackingData();
  const result = importConversions(data.conversions, incoming, { source });
  data.conversions = result.records;
  data.imports.push({
    id: `imp_${String(data.imports.length + 1).padStart(3, "0")}`,
    source,
    label,
    added: result.added.length,
    skippedDuplicates: result.skippedDuplicates.length,
    rejected: result.rejected.length,
    at: new Date().toISOString(),
  });
  saveTrackingData(data);
  return result;
}
