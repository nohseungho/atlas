// ─── Tracking / Conversion Engine (ATLAS R2) ─────────────────────────────────
// Turns affiliate-network reports (API sync or CSV fallback) into a de-duplicated
// ledger and aggregates a performance dashboard.
//
// Non-negotiable honesty rules from the sprint, enforced here:
//   • Orders / units / revenue / commission come ONLY from network-reported
//     conversions. Clicks are never used to estimate orders.
//   • Clicks count only when they come from an official network report
//     (source = "network"). Local logs are never presented as external clicks.
//   • pending / approved / reversed / refunded are tracked separately.
//   • Duplicate imports are rejected by (source, actionId).
//   • Test events never enter production totals.

export const CONVERSION_STATUSES = ["pending", "approved", "reversed", "refunded"];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Normalize one raw network row into our conversion schema. `actionId` is the
// network's own order/action id and is the dedup key — never invented.
export function normalizeConversion(raw, { source = "network" } = {}) {
  const status = CONVERSION_STATUSES.includes(raw.status) ? raw.status : "pending";
  return {
    actionId: String(raw.actionId || raw.action_id || raw.orderId || "").trim(),
    source,
    network: String(raw.network || "").trim(),
    campaignId: String(raw.campaignId || raw.subId || raw.shared_id || "").trim(),
    productId: String(raw.productId || "").trim(),
    status,
    units: num(raw.units ?? raw.quantity),
    revenue: num(raw.revenue ?? raw.saleAmount ?? raw.amount),
    commission: num(raw.commission ?? raw.payout),
    currency: String(raw.currency || "USD").trim(),
    isTest: raw.isTest === true || raw.test === true || String(raw.isTest).toLowerCase() === "true",
    occurredAt: raw.occurredAt || raw.date || null,
    importedAt: new Date().toISOString(),
  };
}

// Import a batch, rejecting rows whose (source, actionId) already exist.
// Rows with no actionId are rejected too — an unidentifiable conversion cannot
// be de-duplicated and must not silently inflate totals.
export function importConversions(existing = [], incoming = [], { source = "network" } = {}) {
  const seen = new Set(existing.map((c) => `${c.source}::${c.actionId}`));
  const added = [];
  const skippedDuplicates = [];
  const rejected = [];

  for (const raw of incoming) {
    const rec = normalizeConversion(raw, { source });
    if (!rec.actionId) {
      rejected.push({ reason: "actionId 없음 — 중복 방지 불가로 거부", raw });
      continue;
    }
    const key = `${rec.source}::${rec.actionId}`;
    if (seen.has(key)) {
      skippedDuplicates.push(rec.actionId);
      continue;
    }
    seen.add(key);
    added.push(rec);
  }

  return { added, skippedDuplicates, rejected, records: [...existing, ...added] };
}

// Sum a set of conversions with the status split, test excluded.
function summarize(conversions) {
  const prod = conversions.filter((c) => !c.isTest);
  const by = (s) => prod.filter((c) => c.status === s);
  const sum = (rows, field) => rows.reduce((acc, c) => acc + num(c[field]), 0);

  const approved = by("approved");
  const pending = by("pending");
  const reversed = by("reversed");
  const refunded = by("refunded");
  const counted = [...approved, ...pending]; // active orders

  return {
    orders: counted.length,
    units: sum(counted, "units"),
    revenue: sum(counted, "revenue"),
    confirmedCommission: sum(approved, "commission"),
    pendingCommission: sum(pending, "commission"),
    statusCounts: {
      pending: pending.length,
      approved: approved.length,
      reversed: reversed.length,
      refunded: refunded.length,
    },
    testExcluded: conversions.length - prod.length,
  };
}

// Build the dashboard: per-campaign rows + totals. Clicks are only trusted from
// official network reports; anything else is reported as UNKNOWN, never guessed.
export function aggregateDashboard({
  campaigns = [],
  conversions = [],
  clicks = [],
  lastSyncAt = null,
  trackingStatus = {},
} = {}) {
  const networkClicks = clicks.filter((c) => c.source === "network");
  const clicksKnown = networkClicks.length > 0;

  const rows = campaigns.map((camp) => {
    const cConvs = conversions.filter((c) => c.campaignId === camp.campaignId);
    const s = summarize(cConvs);
    const campClicks = clicksKnown
      ? networkClicks.filter((c) => c.campaignId === camp.campaignId).length
      : null;
    return {
      campaignId: camp.campaignId,
      articleId: camp.articleId,
      shortId: camp.shortId,
      platform: camp.platform,
      productId: camp.productId,
      bloggerUrl: camp.bloggerUrl || "",
      isProduction: camp.isProduction === true,
      clicks: campClicks === null ? "UNKNOWN" : campClicks,
      ...s,
      conversionRate:
        campClicks && s.orders ? `${((s.orders / campClicks) * 100).toFixed(1)}%` : "UNKNOWN",
    };
  });

  // Totals only over PRODUCTION campaigns (preview/unpublished excluded).
  const prodRows = rows.filter((r) => r.isProduction);
  const prodConvs = conversions.filter((c) => {
    const camp = campaigns.find((x) => x.campaignId === c.campaignId);
    return camp?.isProduction === true;
  });
  const totals = summarize(prodConvs);
  const totalClicks = clicksKnown
    ? networkClicks.filter((c) => campaigns.find((x) => x.campaignId === c.campaignId)?.isProduction).length
    : "UNKNOWN";

  return {
    rows,
    totals: {
      clicks: totalClicks,
      ...totals,
      conversionRate:
        typeof totalClicks === "number" && totals.orders
          ? `${((totals.orders / totalClicks) * 100).toFixed(1)}%`
          : "UNKNOWN",
    },
    productionCampaignCount: prodRows.length,
    lastSyncAt,
    dataSource: clicksKnown ? "affiliate network report" : "NONE (실제 네트워크 데이터 없음)",
    trackingStatus,
  };
}
