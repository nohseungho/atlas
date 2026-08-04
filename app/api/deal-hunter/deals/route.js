import { NextResponse } from "next/server";
import { buildApiDeal, buildManualDeal, filterAndSortDeals } from "@/lib/atlas/deal-hunter/deal-model";
import { insertDeal, listDeals } from "@/lib/atlas/deal-hunter/deal-repository";
import { providerCatalog } from "@/lib/atlas/deal-hunter/providers/provider-registry";

export const dynamic = "force-dynamic";

// GET /api/deal-hunter/deals — 저장 목록 (필터·정렬 지원)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const deals = filterAndSortDeals(listDeals(), {
    source: searchParams.get("source") || "",
    conditionNormalized: searchParams.get("conditionNormalized") || "",
    verificationStatus: searchParams.get("verificationStatus") || "",
    monetizationStatus: searchParams.get("monetizationStatus") || "",
    shortsCandidate: searchParams.get("shortsCandidate") || "",
    sort: searchParams.get("sort") || "",
  });
  return NextResponse.json({ deals, providers: providerCatalog() });
}

// POST /api/deal-hunter/deals
//   mode = "manual" → 쿠팡·기타몰 수동 등록
//   mode = "api"    → Provider 검색 결과 저장
// 총비용·할인액·할인율은 클라이언트 값을 무시하고 서버에서 다시 계산한다.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const mode = String(body?.mode || "manual");

  let built;
  if (mode === "api") built = buildApiDeal(body.item || {}, { query: body.query || "" });
  else if (mode === "manual") built = buildManualDeal(body.deal || body, {});
  else {
    return NextResponse.json(
      { status: "error", errorCode: "UNSUPPORTED_MODE", message: `알 수 없는 mode: ${mode}` },
      { status: 400 },
    );
  }

  if (!built.ok) {
    return NextResponse.json({ status: "error", errorCode: built.errorCode, errors: built.errors }, { status: 400 });
  }

  const saved = insertDeal(built.deal);
  if (!saved.ok) {
    return NextResponse.json(
      {
        status: "error",
        errorCode: saved.errorCode,
        message: "이미 등록된 상품입니다 (동일 URL 또는 동일 판매처 상품 ID).",
        duplicateId: saved.duplicateId,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ status: "ok", deal: saved.deal }, { status: 201 });
}
