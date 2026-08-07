// Pure Money Hunter candidate selection + semantic dedup. No IO — unit-testable.
// Enforces per-blog niche separation (Blog 01 travel, Blog 02 K-Beauty) and
// rejects candidates a visitor would experience as the same content, even when
// the title differs. Never fabricates trend evidence: a candidate without real
// trendEvidence is flagged RESEARCH_NEEDS_CONFIGURATION, not given a fake score.

const NICHE_BLOG = {
  blog_001: ["travel", "insurance", "trip", "health", "safety", "abroad", "overseas"],
  blog_002: ["k-beauty", "kbeauty", "beauty", "skincare", "cosmetic", "makeup"],
};

export function blogNiche(blogId) {
  return NICHE_BLOG[blogId] || [];
}

export function nicheMatches(blogId, candidate) {
  const niche = blogNiche(blogId);
  if (niche.length === 0) return false;
  const hay = `${candidate.category || ""} ${candidate.keyword || candidate.title || ""} ${(candidate.tags || []).join(" ")}`.toLowerCase();
  return niche.some((n) => hay.includes(n));
}

function tokenSet(s) {
  return new Set(String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}
function lc(arr) {
  return (arr || []).map((x) => String(x).toLowerCase());
}

// A candidate is a semantic duplicate of an existing article when a visitor would
// perceive the same answer: same search intent + reader action + a shared core
// entity, OR a strong keyword overlap, OR shared entities + overlapping answer
// scope. Title text alone is never the sole signal.
export function isSemanticDuplicate(candidate, existing, opts = {}) {
  const kwThreshold = opts.keywordThreshold ?? 0.7;
  const scopeThreshold = opts.scopeThreshold ?? 0.5;
  const cEnt = new Set(lc(candidate.entities));
  for (const e of existing || []) {
    const sameIntent = Boolean(candidate.searchIntent) && candidate.searchIntent === e.searchIntent;
    const sameAction = Boolean(candidate.readerAction) && candidate.readerAction === e.readerAction;
    const eEnt = new Set(lc(e.entities));
    let shared = 0;
    for (const x of cEnt) if (eEnt.has(x)) shared += 1;
    const kw = jaccard(tokenSet(candidate.keyword || candidate.title), tokenSet(e.keyword || e.title));
    const scope = jaccard(tokenSet(candidate.answerScope), tokenSet(e.answerScope));

    if ((sameIntent && sameAction && shared >= 1) || kw >= kwThreshold || (shared >= 1 && scope >= scopeThreshold)) {
      return { duplicate: true, of: e.id || e.keyword || e.title, reason: "search intent / entity / reader-action overlap" };
    }
  }
  return { duplicate: false };
}

// Selects the best eligible candidate for a blog:
//   niche match + unused moneyHunterId + not a semantic duplicate, ranked by
//   moneyScore. Candidates lacking real trendEvidence are excluded from the
//   ranked pick and returned separately as needsResearch (never fake-scored).
export function selectCandidate({ blogId, candidates = [], existing = [], usedMoneyHunterIds = [] }) {
  const used = new Set(usedMoneyHunterIds);
  const eligible = [];
  const rejected = [];
  const needsResearch = [];

  for (const c of candidates) {
    if (used.has(c.id)) {
      rejected.push({ id: c.id, reason: "moneyHunterId already used" });
      continue;
    }
    if (!nicheMatches(blogId, c)) {
      rejected.push({ id: c.id, reason: `niche mismatch for ${blogId}` });
      continue;
    }
    const dup = isSemanticDuplicate(c, existing);
    if (dup.duplicate) {
      rejected.push({ id: c.id, reason: `semantic duplicate of ${dup.of}` });
      continue;
    }
    if (!c.trendEvidence) {
      needsResearch.push({ id: c.id, reason: "RESEARCH_NEEDS_CONFIGURATION" });
      continue;
    }
    eligible.push(c);
  }

  eligible.sort((a, b) => (b.moneyScore || 0) - (a.moneyScore || 0));
  return { chosen: eligible[0] || null, eligible, eligibleCount: eligible.length, rejected, needsResearch };
}
