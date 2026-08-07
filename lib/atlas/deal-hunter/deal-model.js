// ─── Deal Hunter · Deal 검증 및 정규화 ──────────────────────────────────────
// 라우트 핸들러는 얇게 두고, 검증·중복차단·재계산은 전부 여기서 처리한다.
// (Next 경로 alias 없이 상대경로만 쓰므로 node --test로 그대로 검증 가능하다.)

import { isCondition, normalizeManualCondition } from "./conditions.js";
import { computeTotals, parseMoney } from "./pricing.js";

export const VERIFICATION_STATUSES = ["PENDING", "VERIFIED", "EXCLUDED"];
export const MONETIZATION_STATUSES = ["CONNECTED", "UNCONNECTED"];
export const SOURCE_MODES = ["API", "MANUAL_VERIFIED"];

export const SOURCES = [
  { id: "ebay", label: "eBay", mode: "API" },
  { id: "coupang", label: "쿠팡", mode: "MANUAL_VERIFIED" },
  { id: "other", label: "기타 쇼핑몰", mode: "MANUAL_VERIFIED" },
];

// http/https만 허용한다. javascript:, data:, file: 스킴은 저장하지 않는다.
export function isSafeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

function trim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isoOrNull(value) {
  const raw = trim(value);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function nextDealId(deals) {
  const max = (deals || []).reduce((acc, d) => {
    const m = /^deal_(\d+)$/.exec(d?.id || "");
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `deal_${String(max + 1).padStart(3, "0")}`;
}

// URL 비교용 정규화. 추적 파라미터 차이로 중복이 뚫리지 않게 최소한만 정리한다.
function urlKey(value) {
  const raw = trim(value);
  if (!raw) return "";
  return raw.replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
}

/**
 * 이미 저장된 상품인지 검사한다. sourceUrl 또는 (source + sourceItemId) 중복 차단.
 */
export function findDuplicate(deals, candidate) {
  const key = urlKey(candidate?.sourceUrl);
  const itemId = trim(candidate?.sourceItemId);
  const source = trim(candidate?.source);
  return (
    (deals || []).find((d) => {
      if (d.id && candidate.id && d.id === candidate.id) return false;
      if (key && urlKey(d.sourceUrl) === key) return true;
      if (itemId && source && trim(d.sourceItemId) === itemId && trim(d.source) === source) return true;
      return false;
    }) || null
  );
}

function normalizeImageUrls(input) {
  const list = Array.isArray(input) ? input : [input];
  return list.map(trim).filter((u) => u && isSafeHttpUrl(u));
}

/**
 * 수동 등록 입력을 검증하고 저장 가능한 deal 객체로 만든다.
 * @returns {{ok:true, deal:object} | {ok:false, errors:string[], errorCode:string}}
 */
export function buildManualDeal(input = {}, { now = new Date().toISOString() } = {}) {
  const errors = [];

  const source = trim(input.source);
  if (!source) errors.push("판매처(source)는 필수입니다.");

  const sourceUrl = trim(input.sourceUrl);
  if (!sourceUrl) errors.push("원본 상품 URL은 필수입니다.");
  else if (!isSafeHttpUrl(sourceUrl)) errors.push("원본 상품 URL은 http/https만 허용됩니다.");

  const title = trim(input.title);
  if (!title) errors.push("상품명은 필수입니다.");

  const conditionOriginal = trim(input.conditionOriginal);
  if (!conditionOriginal) errors.push("원본 상품 상태는 필수입니다.");

  const currency = trim(input.currency).toUpperCase();
  if (!currency) errors.push("통화는 필수입니다.");

  const affiliateUrl = trim(input.affiliateUrl);
  if (affiliateUrl && !isSafeHttpUrl(affiliateUrl)) {
    errors.push("제휴 URL은 http/https만 허용됩니다.");
  }

  const checkedAt = isoOrNull(input.checkedAt);
  if (!checkedAt) errors.push("마지막 확인 시각은 필수이며 유효한 일시여야 합니다.");

  const money = {};
  for (const [field, label, required] of [
    ["price", "판매 가격", true],
    ["shippingCost", "배송비", false],
    ["importCost", "수입 비용", false],
    ["referenceNewPrice", "비교 기준 새상품 가격", false],
  ]) {
    const parsed = parseMoney(input[field], { field: label, required });
    if (!parsed.ok) errors.push(parsed.error);
    else money[field] = parsed.value;
  }

  if (errors.length) return { ok: false, errors, errorCode: "VALIDATION_FAILED" };

  const referenceCurrency = trim(input.referenceCurrency).toUpperCase() || currency;
  const { conditionNormalized, conditionEvidence } = normalizeManualCondition({
    conditionOriginal,
    conditionEvidence: input.conditionEvidence,
    title,
  });

  const totals = computeTotals({
    price: money.price,
    currency,
    shippingCost: money.shippingCost,
    importCost: money.importCost,
    referenceNewPrice: money.referenceNewPrice,
    referenceCurrency,
  });

  const deal = {
    id: "",
    query: trim(input.query),
    title,
    manufacturer: trim(input.manufacturer),
    modelNumber: trim(input.modelNumber),
    source,
    sourceMode: "MANUAL_VERIFIED",
    sourceItemId: trim(input.sourceItemId),
    sourceUrl,
    affiliateUrl: affiliateUrl || "",
    imageUrls: normalizeImageUrls(input.imageUrls || input.imageUrl),
    conditionOriginal,
    conditionOriginalId: trim(input.conditionOriginalId),
    conditionNormalized,
    conditionEvidence,
    price: money.price,
    currency,
    shippingCost: money.shippingCost,
    importCost: money.importCost,
    totalCost: totals.totalCost,
    totalCostConfirmed: totals.totalCostConfirmed,
    referenceNewPrice: money.referenceNewPrice,
    referenceCurrency,
    discountAmount: totals.discountAmount,
    discountPercent: totals.discountPercent,
    discountBasis: totals.discountBasis,
    seller: trim(input.seller),
    packageContents: trim(input.packageContents),
    warranty: trim(input.warranty),
    returnPolicy: trim(input.returnPolicy),
    availability: trim(input.availability) || "UNKNOWN",
    shipToKorea: trim(input.shipToKorea) || "UNKNOWN",
    checkedAt,
    verificationStatus: "PENDING",
    monetizationStatus: affiliateUrl ? "CONNECTED" : "UNCONNECTED",
    shortsCandidate: false,
    shortsCandidateNote: "",
    createdAt: now,
    updatedAt: now,
  };

  return { ok: true, deal };
}

/**
 * eBay Provider가 정규화한 검색 결과를 저장용 deal로 만든다.
 * Provider가 내려주지 않은 값은 추측하지 않고 null/UNKNOWN으로 둔다.
 */
export function buildApiDeal(item = {}, { now = new Date().toISOString(), query = "" } = {}) {
  const errors = [];
  const sourceUrl = trim(item.sourceUrl);
  if (!sourceUrl) errors.push("원본 상품 URL이 없어 저장할 수 없습니다.");
  else if (!isSafeHttpUrl(sourceUrl)) errors.push("원본 상품 URL은 http/https만 허용됩니다.");
  if (!trim(item.title)) errors.push("상품명이 없어 저장할 수 없습니다.");

  const priceParsed = parseMoney(item.price, { field: "판매 가격", required: true });
  if (!priceParsed.ok) errors.push(priceParsed.error);
  const shipParsed = parseMoney(item.shippingCost, { field: "배송비" });
  if (!shipParsed.ok) errors.push(shipParsed.error);
  const refParsed = parseMoney(item.referenceNewPrice, { field: "비교 기준 새상품 가격" });
  if (!refParsed.ok) errors.push(refParsed.error);

  const currency = trim(item.currency).toUpperCase();
  if (!currency) errors.push("통화 정보가 없어 저장할 수 없습니다.");

  const affiliateUrl = trim(item.affiliateUrl);
  if (affiliateUrl && !isSafeHttpUrl(affiliateUrl)) errors.push("제휴 URL은 http/https만 허용됩니다.");

  if (errors.length) return { ok: false, errors, errorCode: "VALIDATION_FAILED" };

  const referenceCurrency = trim(item.referenceCurrency).toUpperCase() || currency;
  const totals = computeTotals({
    price: priceParsed.value,
    currency,
    shippingCost: shipParsed.value,
    importCost: null,
    referenceNewPrice: refParsed.value,
    referenceCurrency,
  });

  const conditionNormalized = isCondition(item.conditionNormalized) ? item.conditionNormalized : "UNKNOWN";

  const deal = {
    id: "",
    query: trim(query || item.query),
    title: trim(item.title),
    manufacturer: trim(item.manufacturer),
    modelNumber: trim(item.modelNumber),
    source: trim(item.source) || "ebay",
    sourceMode: "API",
    sourceItemId: trim(item.sourceItemId),
    sourceUrl,
    affiliateUrl: affiliateUrl || "",
    imageUrls: normalizeImageUrls(item.imageUrls),
    conditionOriginal: trim(item.conditionOriginal),
    conditionOriginalId: trim(item.conditionOriginalId),
    conditionNormalized,
    conditionEvidence: trim(item.conditionEvidence),
    price: priceParsed.value,
    currency,
    shippingCost: shipParsed.value,
    importCost: null,
    totalCost: totals.totalCost,
    totalCostConfirmed: totals.totalCostConfirmed,
    referenceNewPrice: refParsed.value,
    referenceCurrency,
    discountAmount: totals.discountAmount,
    discountPercent: totals.discountPercent,
    discountBasis: totals.discountBasis,
    seller: trim(item.seller),
    packageContents: trim(item.packageContents),
    warranty: trim(item.warranty),
    returnPolicy: trim(item.returnPolicy),
    availability: trim(item.availability) || "UNKNOWN",
    shipToKorea: trim(item.shipToKorea) || "UNKNOWN",
    checkedAt: isoOrNull(item.checkedAt) || now,
    verificationStatus: "PENDING",
    monetizationStatus: affiliateUrl ? "CONNECTED" : "UNCONNECTED",
    shortsCandidate: false,
    shortsCandidateNote: "",
    createdAt: now,
    updatedAt: now,
  };

  return { ok: true, deal };
}

export const PATCHABLE_FIELDS = [
  "verificationStatus",
  "affiliateUrl",
  "monetizationStatus",
  "price",
  "shippingCost",
  "importCost",
  "referenceNewPrice",
  "availability",
  "checkedAt",
  "shortsCandidate",
  "conditionNormalized",
  "conditionEvidence",
];

const SOLD_OUT = /(품절|sold\s*out|out\s*of\s*stock|재고\s*없음)/i;

/**
 * 쇼핑쇼츠 후보 전환 가능 여부. 조건을 못 채우면 이유를 함께 돌려준다.
 */
export function shortsCandidateEligibility(deal = {}) {
  const reasons = [];
  if (deal.verificationStatus !== "VERIFIED") reasons.push("검수 완료(VERIFIED) 상태가 아닙니다.");
  if (!deal.conditionNormalized || deal.conditionNormalized === "UNKNOWN") {
    reasons.push("표준 상품 상태가 UNKNOWN입니다.");
  }
  if (!deal.sourceUrl) reasons.push("원본 상품 URL이 없습니다.");
  if (!Number.isFinite(deal.price) || !deal.currency) reasons.push("가격 또는 통화가 없습니다.");
  if (SOLD_OUT.test(String(deal.availability || ""))) reasons.push("재고 상태가 품절입니다.");
  return { eligible: reasons.length === 0, reasons };
}

/**
 * 허용 필드만 반영하고 계산값은 서버에서 다시 만든다.
 * 클라이언트가 보낸 totalCost/discountAmount/discountPercent는 무시한다.
 */
export function applyDealPatch(deal, patch = {}, { now = new Date().toISOString() } = {}) {
  const errors = [];
  const next = { ...deal };

  const unknown = Object.keys(patch).filter((k) => !PATCHABLE_FIELDS.includes(k));
  if (unknown.length) {
    return {
      ok: false,
      errorCode: "FIELD_NOT_PATCHABLE",
      errors: [`수정할 수 없는 필드입니다: ${unknown.join(", ")}`],
    };
  }

  if ("verificationStatus" in patch) {
    if (!VERIFICATION_STATUSES.includes(patch.verificationStatus)) {
      errors.push(`verificationStatus 허용값: ${VERIFICATION_STATUSES.join(", ")}`);
    } else next.verificationStatus = patch.verificationStatus;
  }

  if ("conditionNormalized" in patch) {
    if (!isCondition(patch.conditionNormalized)) errors.push("conditionNormalized 값이 표준 상태가 아닙니다.");
    else next.conditionNormalized = patch.conditionNormalized;
  }

  if ("conditionEvidence" in patch) next.conditionEvidence = trim(patch.conditionEvidence);
  if ("availability" in patch) next.availability = trim(patch.availability) || "UNKNOWN";

  if ("affiliateUrl" in patch) {
    const url = trim(patch.affiliateUrl);
    if (url && !isSafeHttpUrl(url)) errors.push("제휴 URL은 http/https만 허용됩니다.");
    else next.affiliateUrl = url;
  }

  if ("monetizationStatus" in patch) {
    if (!MONETIZATION_STATUSES.includes(patch.monetizationStatus)) {
      errors.push(`monetizationStatus 허용값: ${MONETIZATION_STATUSES.join(", ")}`);
    } else next.monetizationStatus = patch.monetizationStatus;
  }

  if ("checkedAt" in patch) {
    const iso = isoOrNull(patch.checkedAt);
    if (!iso) errors.push("checkedAt이 유효한 일시가 아닙니다.");
    else next.checkedAt = iso;
  }

  for (const [field, label] of [
    ["price", "판매 가격"],
    ["shippingCost", "배송비"],
    ["importCost", "수입 비용"],
    ["referenceNewPrice", "비교 기준 새상품 가격"],
  ]) {
    if (!(field in patch)) continue;
    const parsed = parseMoney(patch[field], { field: label, required: field === "price" });
    if (!parsed.ok) errors.push(parsed.error);
    else next[field] = parsed.value;
  }

  if ("shortsCandidate" in patch) {
    if (typeof patch.shortsCandidate !== "boolean") errors.push("shortsCandidate는 true/false여야 합니다.");
    else next.shortsCandidate = patch.shortsCandidate;
  }

  if (errors.length) return { ok: false, errorCode: "VALIDATION_FAILED", errors };

  // 제휴 URL이 실제로 있을 때만 CONNECTED가 될 수 있다. 일반 URL을 제휴로
  // 승격시키지 않는다.
  if (!next.affiliateUrl) next.monetizationStatus = "UNCONNECTED";

  const totals = computeTotals({
    price: next.price,
    currency: next.currency,
    shippingCost: next.shippingCost,
    importCost: next.importCost,
    referenceNewPrice: next.referenceNewPrice,
    referenceCurrency: next.referenceCurrency || next.currency,
  });
  next.totalCost = totals.totalCost;
  next.totalCostConfirmed = totals.totalCostConfirmed;
  next.discountAmount = totals.discountAmount;
  next.discountPercent = totals.discountPercent;
  next.discountBasis = totals.discountBasis;

  if (next.shortsCandidate) {
    const check = shortsCandidateEligibility(next);
    if (!check.eligible) {
      // 후보로 "전환"하려는 요청은 거부한다.
      if (patch.shortsCandidate === true) {
        return { ok: false, errorCode: "SHORTS_NOT_ELIGIBLE", errors: check.reasons };
      }
      // 이미 후보인 상품이 다른 필드 변경(예: 제외 처리, 품절)으로 자격을 잃으면
      // 그 변경을 막지 않고 후보 자격만 자동 해제한다.
      next.shortsCandidate = false;
      next.shortsCandidateNote = `자동 해제: ${check.reasons.join(" / ")}`;
    } else if (next.shortsCandidateNote) {
      next.shortsCandidateNote = "";
    }
  }

  next.updatedAt = now;
  return { ok: true, deal: next };
}

const SORTERS = {
  priceAsc: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  discountDesc: (a, b) => (b.discountPercent ?? -Infinity) - (a.discountPercent ?? -Infinity),
  checkedAtDesc: (a, b) => String(b.checkedAt || "").localeCompare(String(a.checkedAt || "")),
  createdAtDesc: (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
};

export function filterAndSortDeals(deals, query = {}) {
  let rows = [...(deals || [])];
  if (query.source) rows = rows.filter((d) => d.source === query.source);
  if (query.conditionNormalized) rows = rows.filter((d) => d.conditionNormalized === query.conditionNormalized);
  if (query.verificationStatus) rows = rows.filter((d) => d.verificationStatus === query.verificationStatus);
  if (query.monetizationStatus) rows = rows.filter((d) => d.monetizationStatus === query.monetizationStatus);
  if (query.shortsCandidate === "true") rows = rows.filter((d) => d.shortsCandidate === true);
  if (query.shortsCandidate === "false") rows = rows.filter((d) => d.shortsCandidate !== true);
  const sorter = SORTERS[query.sort] || SORTERS.createdAtDesc;
  return rows.sort(sorter);
}
