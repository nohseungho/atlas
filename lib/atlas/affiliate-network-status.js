// ─── Affiliate Network Integration Status (ATLAS R2) ─────────────────────────
// Reports the REAL tracking readiness with accurate BLOCKED reasons, per the
// sprint's honesty rules. Investigated: the repo has NO existing Impact or
// VisitorsCoverage adapter, and there are no network API credentials in env.
// We do NOT hardcode Sub-ID / shared-ID / endpoints guessed from memory.
function present(name) {
  return typeof process !== "undefined" && !!process.env?.[name];
}

export function affiliateNetworkStatus({ activeProductCount = 0 } = {}) {
  const impactApi = present("IMPACT_ACCOUNT_SID") && present("IMPACT_AUTH_TOKEN");
  const vcApi = present("VISITORS_COVERAGE_API_KEY");

  const blockers = [];
  if (activeProductCount === 0) blockers.push("BLOCKED_AFFILIATE_APPROVAL");
  // No confirmed public tracking endpoint / affiliate tracking link exists, and
  // a localhost app cannot receive real external clicks.
  blockers.push("BLOCKED_PUBLIC_TRACKING_ENDPOINT");

  return {
    activeProductCount,
    apiSync: {
      impact: impactApi ? "READY (server-only adapter, read-only sync)" : "NEEDS_CONFIGURATION",
      visitorsCoverage: vcApi ? "READY" : "NEEDS_CONFIGURATION",
    },
    csvFallback: "AVAILABLE (공식 CSV 리포트 import — POST /api/atlas/tracking action=importCsv)",
    publicTracking: "BLOCKED_PUBLIC_TRACKING_ENDPOINT",
    affiliateApproval: activeProductCount > 0 ? "APPROVED" : "BLOCKED_AFFILIATE_APPROVAL",
    blockers,
    hasRealData: false,
    note:
      "실제 click/order/unit/revenue 데이터 없음. 네트워크 승인·공개 추적 endpoint 확보 전까지 Production 성과는 0으로 정직하게 표시됩니다.",
  };
}
