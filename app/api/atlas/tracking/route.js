import { NextResponse } from "next/server";
import { readJson } from "@/lib/data-store";
import { aggregateDashboard } from "@/lib/atlas/tracking-engine";
import { countActiveAffiliate } from "@/lib/atlas/affiliate-status";
import { affiliateNetworkStatus } from "@/lib/atlas/affiliate-network-status";
import { getTrackingData, importConversionBatch } from "@/lib/atlas/repositories/tracking-repository";

export const dynamic = "force-dynamic";

// Minimal CSV parser for the official-report fallback. Header row required.
function parseCsv(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h] = (cells[i] || "").trim()));
    return row;
  });
}

export async function GET() {
  const data = getTrackingData();
  const articles = readJson("articles.json").articles || [];
  const status = affiliateNetworkStatus({ activeProductCount: countActiveAffiliate(articles) });
  const lastImport = data.imports[data.imports.length - 1];

  const dashboard = aggregateDashboard({
    campaigns: data.campaigns,
    conversions: data.conversions,
    clicks: data.clicks,
    lastSyncAt: lastImport?.at || null,
    trackingStatus: status,
  });

  return NextResponse.json({ dashboard, imports: data.imports, networkStatus: status });
}

// POST actions:
//   action = "importCsv"    { csv, source, label }  — official CSV report import
//   action = "importJson"   { rows, source, label } — network JSON conversions
// Both dedup by (source, actionId) and never fabricate orders from clicks.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { action, source = "network", label = "" } = body;

  let rows;
  if (action === "importCsv") rows = parseCsv(body.csv);
  else if (action === "importJson") rows = Array.isArray(body.rows) ? body.rows : [];
  else return NextResponse.json({ error: `알 수 없는 action: ${action}` }, { status: 400 });

  const result = importConversionBatch(rows, { source, label });
  return NextResponse.json({
    ok: true,
    added: result.added.length,
    skippedDuplicates: result.skippedDuplicates.length,
    rejected: result.rejected,
  });
}
