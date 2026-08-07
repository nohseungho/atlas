import { NextResponse } from "next/server";
import { providerCatalog, searchByProvider } from "@/lib/atlas/deal-hunter/providers/provider-registry";

export const dynamic = "force-dynamic";

// GET /api/deal-hunter/search?q=...&provider=ebay
// Provider 미설정은 HTTP 오류가 아니라 구조화된 상태로 내려서 화면이 깨지지 않게 한다.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const provider = (searchParams.get("provider") || "").trim();

  if (!provider) {
    return NextResponse.json(
      { status: "error", errorCode: "PROVIDER_REQUIRED", message: "provider는 필수입니다.", providers: providerCatalog() },
      { status: 400 },
    );
  }
  if (!q) {
    return NextResponse.json(
      { status: "error", errorCode: "QUERY_REQUIRED", message: "검색어(q)는 필수입니다." },
      { status: 400 },
    );
  }

  const result = await searchByProvider(provider, q);

  if (result.errorCode === "UNSUPPORTED_PROVIDER") {
    return NextResponse.json({ ...result, providers: providerCatalog() }, { status: 400 });
  }

  return NextResponse.json({ query: q, ...result });
}
