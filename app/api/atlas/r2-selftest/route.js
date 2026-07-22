import { NextResponse } from "next/server";
import { readJson } from "@/lib/data-store";
import { buildRecommendations, duplicationAgainstCorpus } from "@/lib/atlas/recommendation-engine";
import { runArticleQa } from "@/lib/atlas/qa-engine";
import { buildShortsDraft } from "@/lib/atlas/shorts-engine";
import { makeCampaignId, parseCampaignId, makeShortId } from "@/lib/atlas/campaign-engine";
import { importConversions, aggregateDashboard } from "@/lib/atlas/tracking-engine";
import { canAdvance } from "@/lib/atlas/revenue-pipeline";
import { countActiveAffiliate } from "@/lib/atlas/affiliate-status";

export const dynamic = "force-dynamic";

// Server-side self-test: runs the R2 engines against the real fixtures and a few
// synthetic cases. Same module system as production, so this is a real check —
// not a mock. GET /api/atlas/r2-selftest → { pass, results }.
export async function GET() {
  const articles = readJson("articles.json").articles || [];
  const keywords = readJson("keywords.json").keywords || [];
  const categories = readJson("categories.json").items || [];
  const results = [];
  const check = (name, cond, detail = "") => results.push({ name, pass: !!cond, detail });

  // ── Affiliate baseline
  const activeAffiliate = countActiveAffiliate(articles);
  check("affiliate-zero-active", activeAffiliate === 0, `active=${activeAffiliate}`);

  // ── Recommendations
  const rec = buildRecommendations({ keywords, articles, categories, affiliateActiveCount: activeAffiliate });
  check("rec-count-10", rec.candidates.length === 10, `n=${rec.candidates.length}`);
  check("rec-trend-unknown", rec.candidates.every((c) => c.trend.sevenDay === "UNKNOWN"), "no fabricated trends");
  check("rec-affiliate-blocked", rec.blocked.includes("BLOCKED_AFFILIATE_APPROVAL"));
  check(
    "rec-product-no-cta",
    rec.candidates.filter((c) => c.type === "product" || c.type === "comparison").every((c) => c.monetization.salesCtaAllowed === false),
    "product candidates emit no CTA while affiliate inactive",
  );
  check("rec-priority-sequential", rec.candidates.every((c, i) => c.priority === i + 1));

  // ── Duplication detection vs corpus (art_004 topic)
  const dup = duplicationAgainstCorpus("What to Do If You Get Sick While Traveling Abroad", "", articles);
  check("dup-detects-existing", dup.level === "high" || dup.level === "medium", `level=${dup.level} overlap=${dup.overlap}%`);

  // ── QA on golden fixtures — must PASS
  for (const id of ["art_004", "art_005", "art_006"]) {
    const a = articles.find((x) => x.id === id);
    const qa = runArticleQa(a, { articles, humanApproved: false });
    check(`qa-${id}-pass`, qa.pass, qa.checks.filter((c) => c.status === "FAIL").map((c) => c.id).join(",") || "clean");
    check(`qa-${id}-no-sales`, qa.checks.find((c) => c.id === "affiliateOff")?.status === "PASS");
    check(`qa-${id}-publish-locked-without-approval`, qa.gates.canPublish === false, "no auto-publish");
  }

  // ── QA must FAIL a broken article
  const broken = { ...articles.find((x) => x.id === "art_004"), id: "art_broken", bodyMarkdown: "## Too short\nnot enough words." };
  const brokenQa = runArticleQa(broken, { articles });
  check("qa-broken-fails", brokenQa.pass === false && brokenQa.gates.canApprove === false);

  // ── Campaign ids: deterministic + reversible
  const cid = makeCampaignId({ articleId: "art_004", shortId: "shr_art_004_01", platform: "youtube", productId: "none" });
  const cid2 = makeCampaignId({ articleId: "art_004", shortId: "shr_art_004_01", platform: "youtube", productId: "none" });
  const parsed = parseCampaignId(cid);
  check("campaign-deterministic", cid === cid2);
  check("campaign-reversible", parsed && parsed.articleId === "art-004" && parsed.platform === "youtube", JSON.stringify(parsed));
  // makeShortId slug-normalizes art_004 → art-004, so the existing id must match
  // that real format for the collision check to exercise the increment path.
  const sid = makeShortId("art_004", ["shr_art-004_01"]);
  check("shortid-collision-free", sid === "shr_art-004_02", sid);

  // ── Shorts draft: unpublished art_004 → info-only + preview
  const shortPrev = buildShortsDraft(articles.find((x) => x.id === "art_004"), { affiliateActiveCount: activeAffiliate, existingShortIds: [] });
  check("shorts-preview-not-production", shortPrev.isProduction === false);
  check("shorts-info-only", shortPrev.mode === "informational" && shortPrev.productTieIn.enabled === false);
  check("shorts-3-platform-campaigns", shortPrev.campaigns.length === 3);
  check("shorts-tracked-url-blocked", shortPrev.campaigns.every((c) => c.trackedUrlStatus === "BLOCKED_PUBLIC_TRACKING_ENDPOINT"));
  // published art_002 → production
  const shortProd = buildShortsDraft(articles.find((x) => x.id === "art_002"), { affiliateActiveCount: activeAffiliate, isProduction: true, existingShortIds: [] });
  check("shorts-published-is-production", shortProd.isProduction === true);

  // ── Tracking: dedup, test exclusion, status split
  const base = [
    { actionId: "A1", campaignId: cid, status: "approved", units: 1, revenue: 100, commission: 10 },
    { actionId: "A2", campaignId: cid, status: "pending", units: 1, revenue: 50, commission: 5 },
    { actionId: "T1", campaignId: cid, status: "approved", units: 1, revenue: 999, commission: 99, isTest: true },
  ];
  const imp1 = importConversions([], base, { source: "network" });
  const imp2 = importConversions(imp1.records, [{ actionId: "A1", campaignId: cid, status: "approved", revenue: 100 }], { source: "network" });
  check("tracking-dedup", imp2.added.length === 0 && imp2.skippedDuplicates.length === 1);
  const noId = importConversions([], [{ campaignId: cid, status: "approved", revenue: 5 }], { source: "network" });
  check("tracking-reject-no-actionid", noId.added.length === 0 && noId.rejected.length === 1);

  const dash = aggregateDashboard({
    campaigns: [{ campaignId: cid, articleId: "art_004", shortId: "shr_art_004_01", platform: "youtube", productId: "none", isProduction: true }],
    conversions: imp1.records,
    clicks: [],
  });
  check("tracking-test-excluded", dash.totals.revenue === 150, `revenue=${dash.totals.revenue} (999 test excluded)`);
  check("tracking-status-split", dash.totals.statusCounts.approved === 1 && dash.totals.statusCounts.pending === 1);
  check("tracking-clicks-unknown-not-guessed", dash.totals.clicks === "UNKNOWN" && dash.totals.conversionRate === "UNKNOWN");

  // ── Pipeline gates
  const noProvider = { ready: false, message: "no provider" };
  const gateResearch = canAdvance({ stage: "research", linkedArticleId: "" }, { providerReadiness: noProvider });
  check("pipeline-research-blocked-no-provider", gateResearch.ok === false && gateResearch.status === "NEEDS_CONFIGURATION");
  const gateQaFail = canAdvance({ stage: "qa", linkedArticleId: "art_004" }, { article: articles.find((x) => x.id === "art_004"), qa: { pass: false, failCount: 2 } });
  check("pipeline-qa-gate-blocks-fail", gateQaFail.ok === false);
  const gateReview = canAdvance({ stage: "ready_for_review" }, { humanApproved: false });
  check("pipeline-review-needs-human", gateReview.ok === false && gateReview.status === "AWAITING_HUMAN");

  const pass = results.every((r) => r.pass);
  return NextResponse.json({ pass, total: results.length, failed: results.filter((r) => !r.pass), results });
}
