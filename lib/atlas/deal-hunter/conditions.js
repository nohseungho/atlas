// ─── Deal Hunter · 상품 상태 표준화 ──────────────────────────────────────────
// 판매처가 준 원본 상태 문자열은 절대 버리지 않고, ATLAS 내부 표준값으로만
// 별도 판정한다. 공식 condition 코드가 최우선 근거이고 상품명 키워드는 보조
// 근거일 뿐이다. 근거가 부족하면 추측하지 않고 UNKNOWN으로 남긴다.

export const CONDITIONS = [
  "SEALED_RETURN",
  "OPEN_BOX_EXCELLENT",
  "OPEN_BOX_GOOD",
  "REFURB_CERTIFIED",
  "REFURB_SELLER",
  "DISPLAY_ITEM",
  "USED",
  "UNKNOWN",
];

export const CONDITION_LABELS = {
  SEALED_RETURN: "미개봉 반품",
  OPEN_BOX_EXCELLENT: "개봉·최상 (Open Box)",
  OPEN_BOX_GOOD: "개봉·상",
  REFURB_CERTIFIED: "공식 인증 리퍼",
  REFURB_SELLER: "판매자 리퍼",
  DISPLAY_ITEM: "전시상품",
  USED: "일반 중고",
  UNKNOWN: "상태 확인 불가",
};

export function isCondition(value) {
  return CONDITIONS.includes(value);
}

// eBay Browse API conditionId → ATLAS 표준값. eBay가 공식으로 내려주는 코드만
// 신뢰한다. 2010/2020/2030은 eBay Refurbished 프로그램 등급이라 인증 리퍼로 본다.
const EBAY_CONDITION_IDS = {
  1500: "OPEN_BOX_EXCELLENT", // New other / Open box
  2000: "REFURB_CERTIFIED", // Certified Refurbished
  2010: "REFURB_CERTIFIED", // Excellent - Refurbished
  2020: "REFURB_CERTIFIED", // Very Good - Refurbished
  2030: "REFURB_CERTIFIED", // Good - Refurbished
  2500: "REFURB_SELLER", // Seller refurbished
  3000: "USED", // Used
  4000: "USED", // Very Good (used)
  5000: "USED", // Good (used)
  6000: "USED", // Acceptable (used)
};

// 새상품 코드. 반품·개봉 상품이 아니므로 표준값으로 승격하지 않는다.
const EBAY_NEW_IDS = new Set([1000, 1750]);

export const EBAY_SEARCH_CONDITION_IDS = [1500, 2000, 2010, 2020, 2030, 2500];

// 단순 할인 문구. 이것만으로는 반품·개봉 상품이라고 판정하지 않는다.
const DISCOUNT_ONLY = /(할인|특가|세일|균일가|sale|discount|clearance|deal|off)/i;

// 텍스트 보조 근거. 좁고 명시적인 표현만 인정한다.
const TEXT_RULES = [
  [/(certified\s*refurb|manufacturer\s*refurb|공식\s*인증\s*리퍼|제조사\s*리퍼|인증\s*리퍼)/i, "REFURB_CERTIFIED"],
  [/(seller\s*refurb|판매자\s*리퍼)/i, "REFURB_SELLER"],
  [/(open[\s-]*box|오픈박스|개봉만|단순\s*개봉)/i, "OPEN_BOX_EXCELLENT"],
  [/(전시\s*상품|전시품|display\s*(model|unit|item))/i, "DISPLAY_ITEM"],
  [/(미개봉|미사용\s*반품|sealed|unopened)/i, "SEALED_RETURN"],
  [/(refurbished|리퍼비시|리퍼)/i, "REFURB_SELLER"],
  [/(used|중고|pre[\s-]*owned)/i, "USED"],
];

// 수동 등록에서 쓰는 국내 반품마켓 등급 문자열 → 표준값.
// "중" 등급은 그 자체로는 근거가 약해서 별도 판정 근거가 있어야만 USED가 된다.
const MANUAL_GRADE_RULES = [
  [/^\s*미개봉\s*$/, "SEALED_RETURN"],
  [/^\s*최상\s*$/, "OPEN_BOX_EXCELLENT"],
  [/^\s*상\s*$/, "OPEN_BOX_GOOD"],
];

const WEAK_GRADE = /^\s*(중|하)\s*$/;

function evidence(parts) {
  return parts.filter(Boolean).join(" / ");
}

/**
 * eBay 검색 결과 1건의 상태를 판정한다.
 * 원본 condition 문자열/ID는 호출부에서 그대로 저장한다.
 */
export function normalizeEbayCondition({ conditionId, condition, title } = {}) {
  const idNum = Number(conditionId);
  if (Number.isFinite(idNum) && EBAY_CONDITION_IDS[idNum]) {
    return {
      conditionNormalized: EBAY_CONDITION_IDS[idNum],
      conditionEvidence: evidence([
        `eBay conditionId=${idNum}`,
        condition ? `원본 condition="${condition}"` : "",
      ]),
    };
  }
  if (Number.isFinite(idNum) && EBAY_NEW_IDS.has(idNum)) {
    return {
      conditionNormalized: "UNKNOWN",
      conditionEvidence: evidence([
        `eBay conditionId=${idNum} (새상품)`,
        "반품·개봉·리퍼 상품으로 볼 근거 없음",
      ]),
    };
  }
  // 공식 코드가 없으면 문자열 근거만으로 보조 판정한다.
  const fromText = matchText(condition);
  if (fromText) {
    return {
      conditionNormalized: fromText,
      conditionEvidence: evidence([`원본 condition 문자열="${condition}"`, "공식 conditionId 없음"]),
    };
  }
  const fromTitle = matchText(title);
  if (fromTitle) {
    return {
      conditionNormalized: fromTitle,
      conditionEvidence: evidence([`상품명 보조 근거="${title}"`, "공식 conditionId 없음"]),
    };
  }
  return {
    conditionNormalized: "UNKNOWN",
    conditionEvidence: "공식 condition 코드와 신뢰할 상태 문구가 모두 없음",
  };
}

function matchText(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  for (const [re, mapped] of TEXT_RULES) {
    if (re.test(value)) return mapped;
  }
  return null;
}

/**
 * 수동 등록 상품의 상태를 판정한다.
 * @param {string} conditionOriginal 판매처가 표기한 원본 상태 문자열
 * @param {string} extraEvidence 검수자가 직접 입력한 판정 근거(선택)
 */
export function normalizeManualCondition({ conditionOriginal, conditionEvidence: extraEvidence, title } = {}) {
  const raw = String(conditionOriginal || "").trim();
  const note = String(extraEvidence || "").trim();

  if (!raw) {
    return {
      conditionNormalized: "UNKNOWN",
      conditionEvidence: evidence(["원본 상태 문자열 없음", note]),
    };
  }

  for (const [re, mapped] of MANUAL_GRADE_RULES) {
    if (re.test(raw)) {
      return {
        conditionNormalized: mapped,
        conditionEvidence: evidence([`판매처 등급="${raw}"`, note]),
      };
    }
  }

  if (WEAK_GRADE.test(raw)) {
    // "중" 등급은 등급만으로 중고라고 확정하지 않는다. 검수자가 입력한
    // 판정 근거에 실제 사용 흔적이 적혀 있을 때만 USED로 본다.
    const fromNote = matchText(note);
    if (fromNote) {
      return {
        conditionNormalized: fromNote,
        conditionEvidence: evidence([`판매처 등급="${raw}"`, `검수 근거="${note}"`]),
      };
    }
    return {
      conditionNormalized: "UNKNOWN",
      conditionEvidence: evidence([`판매처 등급="${raw}"`, "등급만으로 상태를 확정할 근거 부족", note]),
    };
  }

  const fromRaw = matchText(raw);
  if (fromRaw) {
    return {
      conditionNormalized: fromRaw,
      conditionEvidence: evidence([`원본 상태="${raw}"`, note]),
    };
  }

  // 할인 문구만 있는 경우는 반품상품으로 오판하지 않는다.
  if (DISCOUNT_ONLY.test(raw)) {
    return {
      conditionNormalized: "UNKNOWN",
      conditionEvidence: evidence([`원본 상태="${raw}"`, "할인 문구일 뿐 상품 상태 근거 아님", note]),
    };
  }

  const fromNote = matchText(note);
  if (fromNote) {
    return {
      conditionNormalized: fromNote,
      conditionEvidence: evidence([`원본 상태="${raw}"`, `검수 근거="${note}"`]),
    };
  }

  const fromTitle = matchText(title);
  if (fromTitle) {
    return {
      conditionNormalized: fromTitle,
      conditionEvidence: evidence([`원본 상태="${raw}"`, `상품명 보조 근거="${title}"`, note]),
    };
  }

  return {
    conditionNormalized: "UNKNOWN",
    conditionEvidence: evidence([`원본 상태="${raw}"`, "표준 상태로 매핑할 근거 부족", note]),
  };
}
