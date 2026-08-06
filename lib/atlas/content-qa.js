// ─── ATLAS Content QA (V1) ───────────────────────────────────────────────────
// The pre-publish gate for the daily pipeline (§6). Item-by-item
// PASS / FAIL / WARN / NEEDS_HUMAN_REVIEW with a reason each — one FAIL
// disables the publish button and the UI shows exactly which rule broke.
//
// Deliberate limits, stated rather than faked:
//   • Factual truth of a statistic or quote CANNOT be verified from here. That
//     check is reported as NEEDS_HUMAN_REVIEW, never as a PASS.
//   • Source URLs get authority + format validation, not live reachability —
//     there is no fetch step wired into this gate.
// Pure — no IO, no @/ imports.
import {
  isAuthoritySource,
  validateInternalLinks,
  validateMetaDescription,
  validateJsonLd,
  hostOf,
} from "./seo-engine.js";
import { isMeaningfulAlt } from "./chatgpt-handoff.js";

export const VERDICT = { PASS: "PASS", FAIL: "FAIL", WARN: "WARN", REVIEW: "NEEDS_HUMAN_REVIEW" };

const MIN_AUTHORITY_SOURCES = 3;

// Text that means the draft was never finished.
const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bLorem ipsum\b/i,
  /\[[^\]]*(?:placeholder|insert|your|add here|fill in)[^\]]*\]/i,
  /\bPLACEHOLDER\b/i,
  /\bXXX+\b/,
  /\bexample\.com\b/i,
  /YOUR_[A-Z_]+/,
  /\/path\/to\//i,
  /\bcoming soon\b/i,
  /<!--\s*(?:TODO|FIXME)/i,
];

// YMYL guarantees. "will be covered" / "guaranteed" / "always pays" turn a
// descriptive guide into an assurance ATLAS is not licensed to make.
const GUARANTEE_PATTERNS = [
  /\b(?:you|it|this policy|the policy|the plan)\s+(?:will|are|is)\s+(?:always\s+)?(?:be\s+)?(?:covered|reimbursed|paid)\b/i,
  /\bguarantee(?:d|s)?\s+(?:coverage|reimbursement|payment|approval)\b/i,
  /\balways\s+(?:pays|covers|reimburses|approved)\b/i,
  /\b(?:100%|fully)\s+(?:covered|guaranteed|reimbursed)\b/i,
  /\bnever\s+(?:denied|rejected)\b/i,
  /\bwe\s+guarantee\b/i,
  /\bcure(?:s|d)?\b|\bprevents?\s+all\b/i,
];

// Ad-click bait. AdSense policy forbids anything that solicits a click.
const AD_BAIT_PATTERNS = [
  /\bclick\s+(?:the\s+|on\s+the\s+)?ad(?:s|vertisement)?\b/i,
  /\bsupport\s+(?:us|this\s+(?:site|blog))\s+by\s+clicking\b/i,
  /\bplease\s+click\b/i,
  /\bcheck\s+out\s+the\s+ads\b/i,
  /\bsponsored\s+links?\s+below\b/i,
];

// Sales surfaces that must not exist while no affiliate program is approved.
const SALES_PATTERNS = [
  /AFFILIATE_LINK/i,
  /\bbuy\s+now\b/i,
  /\badd\s+to\s+cart\b/i,
  /\bshop\s+now\b/i,
  /amzn\.to|amazon\.[a-z]{2,3}\/|tag=[a-z0-9-]+-20\b/i,
  /\bproduct-card\b/i,
  /\bbest\s+price\s+(?:here|today)\b/i,
];

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

function titleWords(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function titleOverlap(a, b) {
  const A = titleWords(a);
  const B = titleWords(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / Math.min(A.size, B.size);
}

function matches(patterns, text) {
  return patterns.filter((re) => re.test(text)).map((re) => String(re));
}

/**
 * Runs the full §6 gate.
 *
 * @param article  the assembled draft (title, metaDescription, bodyHtml,
 *                 sources, visualAssets, internalLinks, jsonLd)
 * @param articles the live corpus, for dedup + internal-link validation
 * @returns { pass, blocking, checks[], gates }
 */
export function runContentQa(article, { articles = [], affiliateApproved = false } = {}) {
  const checks = [];
  const add = (id, label, status, reason) => checks.push({ id, label, status, reason });

  const html = String(article?.bodyHtml || article?.articleHtml || "");
  const text = stripTags(html);
  const haystack = `${article?.title || ""} ${article?.metaDescription || ""} ${text}`;

  // 1. Required fields present
  const missing = [];
  if (!String(article?.title || "").trim()) missing.push("제목");
  if (!text) missing.push("본문");
  if (!String(article?.metaDescription || "").trim()) missing.push("meta description");
  add("required", "제목·본문·meta description 존재", missing.length ? VERDICT.FAIL : VERDICT.PASS,
    missing.length ? `누락: ${missing.join(", ")}` : "3개 항목 모두 존재");

  // 2. Meta description within 150-160
  const meta = validateMetaDescription(article?.metaDescription);
  add("metaDescription", "meta description 150~160자", meta.ok ? VERDICT.PASS : VERDICT.FAIL,
    meta.ok ? `${meta.length}자` : meta.issues.join(" / "));

  // 3. No placeholder / unfinished text
  const ph = matches(PLACEHOLDER_PATTERNS, haystack);
  add("placeholder", "placeholder·미완성 문구 없음", ph.length ? VERDICT.FAIL : VERDICT.PASS,
    ph.length ? `미완성 표현 ${ph.length}건 발견: ${ph.slice(0, 3).join(", ")}` : "미완성 표현 없음");

  // 4. Not a duplicate of an existing article
  let dupOf = "";
  for (const other of articles || []) {
    if (!other || other.id === article?.id) continue;
    if (!["written", "published"].includes(other.status)) continue;
    if (norm(other.title) === norm(article?.title)) { dupOf = `${other.id} (제목 동일)`; break; }
    if (other.slug && article?.slug && norm(other.slug) === norm(article.slug)) { dupOf = `${other.id} (slug 동일)`; break; }
    if (titleOverlap(other.title, article?.title) >= 0.7) { dupOf = `${other.id} (주제 중복)`; break; }
  }
  add("duplicate", "기존 글과 제목·주제 비중복", dupOf ? VERDICT.FAIL : VERDICT.PASS,
    dupOf ? `${dupOf}과 중복됩니다.` : "중복 없음");

  // 5. No absolute medical / insurance / legal guarantees
  const guarantees = matches(GUARANTEE_PATTERNS, text);
  add("noGuarantee", "의료·보험·법률 단정적 보장 없음", guarantees.length ? VERDICT.FAIL : VERDICT.PASS,
    guarantees.length ? `단정적 보장 표현 ${guarantees.length}건 발견` : "단정적 보장 표현 없음");

  // 6. At least 3 real authority sources
  const sources = (article?.sources || []).map((s) => (typeof s === "string" ? { url: s, title: s } : s));
  const httpsSources = sources.filter((s) => /^https:\/\/\S+$/i.test(String(s?.url || "").trim()));
  const authority = httpsSources.filter((s) => isAuthoritySource(s.url));
  const authorityHosts = [...new Set(authority.map((s) => hostOf(s.url)))];
  add("authoritySources", `권위 출처 ${MIN_AUTHORITY_SOURCES}개 이상`,
    authority.length >= MIN_AUTHORITY_SOURCES ? VERDICT.PASS : VERDICT.FAIL,
    authority.length >= MIN_AUTHORITY_SOURCES
      ? `권위 출처 ${authority.length}개 (${authorityHosts.join(", ")})`
      : `권위 출처 ${authority.length}개 / 전체 https 출처 ${httpsSources.length}개 — CDC·State Dept·DOT·TSA·CMS 등 공식 출처 ${MIN_AUTHORITY_SOURCES}개 필요`);

  // 7. Fabrication — honestly not machine-verifiable.
  const numericClaims = (text.match(/\$\s?[\d,]+|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?%/g) || []).length;
  add("fabrication", "통계·기관·인용문 실재 여부", VERDICT.REVIEW,
    `수치 주장 ${numericClaims}건. 사실 여부는 자동 검증이 불가능합니다 — 출처 ${authority.length}개와 대조해 사람이 확인해야 합니다.`);

  // 8. Internal links resolve to real published URLs
  const links = article?.internalLinks || [];
  const linkCheck = validateInternalLinks(links, { articles });
  add("internalLinks", "내부링크 2~4개·실제 공개 URL", linkCheck.ok ? VERDICT.PASS : VERDICT.FAIL,
    linkCheck.ok ? `내부링크 ${linkCheck.count}개 모두 실제 공개 URL` : linkCheck.issues.join(" / "));

  // 9. Images: 5 public https URLs + unique descriptive alt
  const assets = article?.visualAssets || [];
  const imgIssues = [];
  const alts = [];
  for (const a of assets) {
    const url = String(a?.publicUrl || "").trim();
    if (!/^https:\/\/\S+$/i.test(url)) imgIssues.push(`${a?.key || "?"}: 공개 https 이미지 URL 아님`);
    if (!isMeaningfulAlt(a?.alt)) imgIssues.push(`${a?.key || "?"}: alt가 설명적이지 않음`);
    else alts.push(String(a.alt).trim().toLowerCase());
  }
  if (assets.length !== 5) imgIssues.unshift(`이미지 ${assets.length}장 (5장 필요)`);
  if (new Set(alts).size !== alts.length) imgIssues.push("alt 텍스트가 이미지 간 중복됩니다.");
  add("images", "이미지 5장·공개 URL·고유 alt", imgIssues.length ? VERDICT.FAIL : VERDICT.PASS,
    imgIssues.length ? imgIssues.join(" / ") : "5장 모두 통과");

  // 10. Mobile layout — fixed pixel widths and unwrapped tables are what break
  //     a Blogger post on a phone.
  const mobileIssues = [];
  const fixedWidth = html.match(/style="[^"]*width\s*:\s*(\d{3,})px/gi) || [];
  if (fixedWidth.length) mobileIssues.push(`고정 px 너비 ${fixedWidth.length}건`);
  const widthAttr = html.match(/<(?:img|table|iframe)[^>]*\swidth=["']?\d{3,}/gi) || [];
  if (widthAttr.length) mobileIssues.push(`width 속성 고정값 ${widthAttr.length}건`);
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const notFluid = imgTags.filter((t) => !/width\s*:\s*100%|max-width\s*:\s*100%/i.test(t));
  if (notFluid.length) mobileIssues.push(`가변 폭이 아닌 이미지 ${notFluid.length}건`);
  const tables = (html.match(/<table\b/gi) || []).length;
  const wrapped = (html.match(/overflow-x\s*:\s*auto/gi) || []).length;
  if (tables > wrapped) mobileIssues.push(`가로 스크롤 래퍼가 없는 표 ${tables - wrapped}개`);
  add("mobile", "모바일 레이아웃(고정폭·표 오버플로)", mobileIssues.length ? VERDICT.FAIL : VERDICT.PASS,
    mobileIssues.length ? mobileIssues.join(" / ") : "고정폭·오버플로 문제 없음");

  // 11. No sales surface while affiliate is unapproved
  const sales = matches(SALES_PATTERNS, html);
  if (affiliateApproved) {
    add("affiliate", "제휴 활성 — 판매 요소 정책", VERDICT.PASS, "제휴 승인 상태");
  } else {
    add("affiliate", "제휴 미승인 시 상품링크·CTA 0개", sales.length ? VERDICT.FAIL : VERDICT.PASS,
      sales.length ? `판매 요소 ${sales.length}건 발견 — 제휴 승인 전에는 금지` : "판매 요소 0개");
  }

  // 12. No ad-click solicitation
  const bait = matches(AD_BAIT_PATTERNS, text);
  add("adBait", "광고 클릭 유도 문구 없음", bait.length ? VERDICT.FAIL : VERDICT.PASS,
    bait.length ? `광고 클릭 유도 표현 ${bait.length}건 발견` : "광고 클릭 유도 표현 없음");

  // 13. JSON-LD, when the caller supplies one
  if (article?.jsonLd) {
    const ld = validateJsonLd(article.jsonLd);
    add("jsonLd", "JSON-LD 1개 유효", ld.ok ? VERDICT.PASS : VERDICT.FAIL, ld.ok ? "Article 스키마 유효" : ld.issues.join(" / "));
  } else {
    add("jsonLd", "JSON-LD 1개 유효", VERDICT.WARN, "JSON-LD가 아직 생성되지 않았습니다.");
  }

  const failed = checks.filter((c) => c.status === VERDICT.FAIL);
  const review = checks.filter((c) => c.status === VERDICT.REVIEW);
  const pass = failed.length === 0;

  return {
    articleId: article?.id || "",
    pass,
    failCount: failed.length,
    blocking: failed.map((c) => ({ id: c.id, label: c.label, reason: c.reason })),
    needsHumanReview: review.map((c) => ({ id: c.id, label: c.label, reason: c.reason })),
    checks,
    gates: {
      // QA passing is necessary but never sufficient: publishing additionally
      // requires the explicit human approval recorded by the Publisher.
      canApprove: pass,
      canSchedule: pass,
      canPublish: false,
    },
    summary: pass
      ? `자동 검수 통과 (사람 확인 필요 ${review.length}건) — 승인·예약 가능`
      : `검수 실패 ${failed.length}건 — 발행 차단`,
  };
}
