// ─── Deal Hunter · 금액 계산 ────────────────────────────────────────────────
// 총비용과 할인율은 항상 서버에서 다시 계산한다. 클라이언트가 보낸 계산값은
// 신뢰하지 않는다. 통화가 다르면 임의 환산하지 않고 계산을 포기한다.

/**
 * 금액 파싱. 숫자가 아닌 값과 음수는 거부한다.
 * @returns {{ok: true, value: number|null} | {ok: false, error: string}}
 */
export function parseMoney(value, { field = "금액", required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) return { ok: false, error: `${field}은(는) 필수입니다.` };
    return { ok: true, value: null };
  }
  if (typeof value === "boolean") return { ok: false, error: `${field}이(가) 숫자가 아닙니다.` };
  const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(num)) return { ok: false, error: `${field}이(가) 숫자가 아닙니다.` };
  if (num < 0) return { ok: false, error: `${field}은(는) 0 이상이어야 합니다.` };
  return { ok: true, value: num };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * 총비용 · 할인액 · 할인율 계산.
 *
 * - totalCost = 판매가 + 배송비 + 수입비용
 * - 배송비/수입비용이 확인되지 않은(null) 값이면 0으로 간주해 더하되,
 *   totalCostConfirmed=false로 표시한다. 무료배송으로 단정하지 않는다.
 * - 할인은 통화가 동일할 때만 계산한다. 판매가가 비교가보다 비싸면
 *   음수 할인율을 그대로 표시한다.
 */
export function computeTotals({
  price,
  currency,
  shippingCost = null,
  importCost = null,
  referenceNewPrice = null,
  referenceCurrency = null,
} = {}) {
  const base = Number.isFinite(price) ? price : null;
  const ship = Number.isFinite(shippingCost) ? shippingCost : null;
  const imp = Number.isFinite(importCost) ? importCost : null;
  const ref = Number.isFinite(referenceNewPrice) ? referenceNewPrice : null;
  const refCur = referenceCurrency || currency || null;

  const totalCost = base === null ? null : round2(base + (ship ?? 0) + (imp ?? 0));
  const totalCostConfirmed = base !== null && ship !== null && imp !== null;

  let discountAmount = null;
  let discountPercent = null;
  let discountBasis = "비교 기준 새상품 가격 없음";

  if (base !== null && ref !== null && ref > 0) {
    if (currency && refCur && currency !== refCur) {
      discountBasis = `통화 불일치(${currency} vs ${refCur}) · 임의 환산하지 않음`;
    } else {
      discountAmount = round2(ref - base);
      discountPercent = Math.round(((ref - base) / ref) * 1000) / 10;
      discountBasis =
        discountAmount >= 0
          ? `동일 통화(${currency}) 비교가 대비 계산`
          : `동일 통화(${currency}) 기준 비교가보다 비쌈`;
    }
  }

  return { totalCost, totalCostConfirmed, discountAmount, discountPercent, discountBasis };
}
