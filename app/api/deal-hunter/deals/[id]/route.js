import { NextResponse } from "next/server";
import { applyDealPatch } from "@/lib/atlas/deal-hunter/deal-model";
import { getDeal, updateDeal } from "@/lib/atlas/deal-hunter/deal-repository";

export const dynamic = "force-dynamic";

// PATCH /api/deal-hunter/deals/[id]
// 허용 필드만 반영한다. 상품 제외는 verificationStatus=EXCLUDED로 처리하며
// 물리 삭제 API는 제공하지 않는다.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const deal = getDeal(id);
  if (!deal) {
    return NextResponse.json({ status: "error", errorCode: "NOT_FOUND", message: "상품을 찾을 수 없습니다." }, { status: 404 });
  }

  const patch = await request.json().catch(() => ({}));
  const result = applyDealPatch(deal, patch || {});
  if (!result.ok) {
    return NextResponse.json({ status: "error", errorCode: result.errorCode, errors: result.errors }, { status: 400 });
  }

  const saved = updateDeal(id, result.deal);
  if (!saved.ok) {
    return NextResponse.json({ status: "error", errorCode: saved.errorCode }, { status: 404 });
  }

  return NextResponse.json({ status: "ok", deal: saved.deal });
}
