// ─── Automated QA Engine (ATLAS R2) ──────────────────────────────────────────
// Item-by-item PASS / FAIL / WARN / NA with a reason for each rule — never a
// single blended verdict. A single FAIL locks approval, image generation, and
// publishing. This runs against real article records (art_004~art_006 are the
// golden fixtures); it never rewrites content.
//
// It is deliberately strict about what it can and cannot know:
//   • Source URLs get FORMAT validation (https, no placeholder/localhost). Live
//     403/404 reachability is NOT asserted — we have no fetch step wired, so
//     that sub-check is reported as NEEDS_CONFIGURATION, not a fake PASS.
import { isValidUrl } from "./revenue-layout-engine";

const MIN_WORDS = 1400;
const MAX_WORDS = 2200;
const REQUIRED_VISUALS = 5;
const MIN_SOURCES = 2;
const MIN_FAQ = 3;
const MIN_H2 = 3;

// Categories where thin sourcing is unsafe → generation must stop, not warn.
const YMYL = /insurance|health|medical|finance|money|legal|tax|보험|의료|건강|금융|법/i;

function wordCount(md) {
  return String(md || "").trim().split(/\s+/).filter(Boolean).length;
}

function h2Titles(md) {
  return (String(md || "").match(/^##\s+(.+)$/gm) || []).map((s) => s.replace(/^##\s+/, "").trim());
}

// afterByline / afterComparisonCriteria / afterFaq are fixed anchors the renderer
// understands; afterSection:<title> must point at a real H2.
const FIXED_ANCHORS = new Set(["afterByline", "afterComparisonCriteria", "afterFaq"]);

function checkPlacement(placement, headings) {
  const p = String(placement || "").trim();
  if (!p) return { ok: false, reason: "placement가 비어 있습니다." };
  if (FIXED_ANCHORS.has(p)) return { ok: true };
  const m = /^afterSection:(.+)$/.exec(p);
  if (m) {
    const target = m[1].trim();
    if (headings.includes(target)) return { ok: true };
    return { ok: false, reason: `afterSection 대상 "${target}"이(가) 실제 H2와 일치하지 않습니다.` };
  }
  return { ok: false, reason: `알 수 없는 placement 형식: "${p}"` };
}

// Detect any active sales surface. With affiliate inactive these must all be 0.
function countSalesSurfaces(article) {
  const plan = article.affiliatePlan || {};
  const active = plan.status === "active" && isValidUrl(String(plan.url || ""));
  const slots = active ? (plan.productSlots || []).length : 0;
  const bodyLinks = active ? (String(article.bodyMarkdown || "").match(/AFFILIATE_LINK/g) || []).length : 0;
  const cta = active && (plan.cta?.topLabel || plan.cta?.decisionLabel) ? 1 : 0;
  return { active, count: slots + bodyLinks + cta, slots, bodyLinks, cta };
}

export function runArticleQa(article, { articles = [], humanApproved = false } = {}) {
  const checks = [];
  const add = (id, label, status, reason) => checks.push({ id, label, status, reason });

  const md = article?.bodyMarkdown || "";
  const wc = wordCount(md);
  const headings = h2Titles(md);

  // 1. Word count
  if (wc >= MIN_WORDS && wc <= MAX_WORDS) add("wordCount", "본문 분량 1,400~2,200단어", "PASS", `${wc}단어`);
  else add("wordCount", "본문 분량 1,400~2,200단어", "FAIL", `${wc}단어 (허용 범위 밖)`);

  // 2. Structure
  add(
    "h2",
    "H2 섹션 구조",
    headings.length >= MIN_H2 ? "PASS" : "FAIL",
    `H2 ${headings.length}개 (최소 ${MIN_H2})`,
  );
  const faq = (article?.faq || []).filter((f) => f?.question && f?.answer);
  add("faq", "FAQ 구성", faq.length >= MIN_FAQ ? "PASS" : "FAIL", `FAQ ${faq.length}개 (최소 ${MIN_FAQ})`);

  // 3. Sources — format validation only; live reachability is NOT claimed.
  const sources = article?.sources || [];
  const badFormat = sources.filter((s) => !isValidUrl(String(s?.url || ""), { requireHttps: true }));
  if (sources.length < MIN_SOURCES) {
    add("sources", "출처 최소 2개 + 형식", "FAIL", `출처 ${sources.length}개 (최소 ${MIN_SOURCES})`);
  } else if (badFormat.length) {
    add("sources", "출처 최소 2개 + 형식", "FAIL", `${badFormat.length}개 출처가 https 형식이 아니거나 placeholder/localhost입니다.`);
  } else {
    add("sources", "출처 최소 2개 + 형식", "PASS", `출처 ${sources.length}개, 모두 https 형식 통과`);
  }
  add(
    "sourcesLive",
    "출처 실제 접근성(403/404) 검증",
    "NEEDS_CONFIGURATION",
    "실시간 URL 접근 검증 단계가 연동되지 않았습니다. 형식만 검증됨.",
  );

  // 4. Unique search intent vs corpus
  let dupHit = null;
  for (const other of articles) {
    if (other.id === article.id) continue;
    if (!["written", "published"].includes(other.status)) continue;
    const sameIntent = (other.searchIntent || "") === (article.searchIntent || "");
    const sameCat = (other.category || "").toLowerCase() === (article.category || "").toLowerCase();
    const sameSlug = (other.slug || "") && other.slug === article.slug;
    if (sameSlug || (sameIntent && sameCat && titleOverlap(other, article) >= 0.6)) {
      dupHit = other.id;
      break;
    }
  }
  add(
    "uniqueIntent",
    "기존 글과 검색 의도 비중복",
    dupHit ? "FAIL" : "PASS",
    dupHit ? `${dupHit}과 검색 의도가 중복됩니다.` : "중복 없음",
  );

  // 5. Visual plan
  const visuals = article?.visualAssets || [];
  const visualIssues = [];
  visuals.forEach((v, i) => {
    if (v.width !== 1600 || v.height !== 900) visualIssues.push(`이미지 ${i + 1}: ${v.width}x${v.height} (1600x900 아님)`);
    if (!String(v.prompt || "").trim()) visualIssues.push(`이미지 ${i + 1}: prompt 없음`);
    if (!String(v.alt || "").trim()) visualIssues.push(`이미지 ${i + 1}: alt 없음`);
    const pl = checkPlacement(v.placement, headings);
    if (!pl.ok) visualIssues.push(`이미지 ${i + 1}: ${pl.reason}`);
  });
  if (visuals.length !== REQUIRED_VISUALS) visualIssues.unshift(`이미지 ${visuals.length}장 (정확히 ${REQUIRED_VISUALS}장 필요)`);
  add(
    "visuals",
    "이미지 계획 5장·1600x900·prompt/alt·placement 일치",
    visualIssues.length ? "FAIL" : "PASS",
    visualIssues.length ? visualIssues.join(" / ") : "5장 모두 통과",
  );

  // 6. YMYL sourcing gate
  const isYmyl = YMYL.test(`${article.category || ""} ${article.keyword || ""}`);
  if (isYmyl) {
    add(
      "ymyl",
      "의료/금융/법률 주제 근거 충족",
      sources.length >= MIN_SOURCES && !badFormat.length ? "PASS" : "FAIL",
      sources.length >= MIN_SOURCES ? "YMYL 주제 — 출처 충족" : "YMYL 주제인데 공식 근거 부족 → 생성 중단 대상",
    );
  } else {
    add("ymyl", "의료/금융/법률 주제 근거 충족", "NA", "YMYL 주제 아님");
  }

  // 7. Affiliate-inactive → zero sales surfaces
  const sales = countSalesSurfaces(article);
  if (!sales.active) {
    add(
      "affiliateOff",
      "제휴 비활성 시 CTA/Product Card/판매 URL 0개",
      sales.count === 0 ? "PASS" : "FAIL",
      sales.count === 0 ? "판매 노출 0개 (정책 준수)" : `판매 노출 ${sales.count}개 발견`,
    );
  } else {
    add("affiliateOff", "제휴 활성 — 판매 노출 정책", "PASS", `제휴 활성, 판매 슬롯 ${sales.slots}개`);
  }

  const failed = checks.filter((c) => c.status === "FAIL");
  const pass = failed.length === 0;

  return {
    articleId: article?.id || "",
    pass,
    failCount: failed.length,
    checks,
    // Gates: content must pass QA to be approvable; publishing additionally
    // requires an explicit human approval flag (no auto-publish, ever).
    gates: {
      canApprove: pass,
      canGenerateImages: pass,
      canPublish: pass && humanApproved === true,
    },
    publishNote: pass
      ? humanApproved
        ? "사람 승인 완료 — 발행 준비됨 (실제 Blogger POST는 별도 수동 실행)"
        : "QA 통과 — 사람의 최종 승인 후 발행 가능"
      : "QA 실패 — 승인·이미지·발행 잠금",
  };
}

function titleOverlap(a, b) {
  const norm = (s) =>
    new Set(
      String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean),
    );
  const A = norm(a.title);
  const B = norm(b.title);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / Math.min(A.size, B.size);
}
