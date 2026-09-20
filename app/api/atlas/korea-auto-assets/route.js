import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { isCoupangUrl, productPhotoSlots } from "@/lib/atlas/korea-product-auto";
import { coupangPartnersConfigured, findCoupangPartnersProduct } from "@/lib/atlas/coupang-partners";
import { coupangPartnersStatus, isPartnersLink, monetizationRecord } from "@/lib/atlas/coupang-partners-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = "korea-drafts.json";
const GENERATED_PREFIX = "atlas-generated://";

async function importGenericProduct(draft) {
  const url = String(draft.productUrl || draft.affiliateUrl || "").trim();
  if (!url) return null;
  try {
    const origin = process.env.ATLAS_BASE_URL || "http://localhost:3002";
    const res = await fetch(`${origin}/api/atlas/product-import`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

async function importProduct(draft) {
  const sourceUrl = String(draft.affiliateUrl || draft.productUrl || "").trim();
  const coupang = isCoupangUrl(sourceUrl);
  let coupangResult = null;

  // Open API is optional. Accounts that are not finally approved must not block staging.
  if (coupang && coupangPartnersConfigured()) {
    coupangResult = await findCoupangPartnersProduct({ productName: draft.productName, limit: 10 });
    if (coupangResult?.ok && coupangResult.imageCandidates?.length) {
      return { imported: coupangResult, sourceStatus: "coupang_partners_open_api", sourceError: null };
    }
  } else if (coupang) {
    coupangResult = {
      code: "COUPANG_PARTNERS_NOT_CONFIGURED",
      error: "쿠팡 파트너스 최종 승인 전이라 Open API는 건너뜁니다.",
    };
  } else if (coupangPartnersConfigured() && !String(draft.affiliateUrl || "").trim()) {
    // 승인 후 신규 초안: 쿠팡 주소가 없어도 상품명으로 공식 소재·제휴 링크를 찾는다. 기존 글은 이 경로를 타지 않는다.
    coupangResult = await findCoupangPartnersProduct({ productName: draft.productName, limit: 10 });
    if (coupangResult?.ok && coupangResult.imageCandidates?.length) {
      return { imported: coupangResult, sourceStatus: "coupang_partners_open_api", sourceError: null };
    }
  }

  const generic = await importGenericProduct(draft);
  if (generic?.imageCandidates?.length || generic?.images?.length || generic?.draft?.images?.length) {
    return {
      imported: generic,
      sourceStatus: coupang ? "generic_fallback" : "generic_product_page",
      sourceError: coupangResult?.error || null,
    };
  }

  return {
    imported: null,
    sourceStatus: coupang ? (coupangResult?.code || "coupang_product_image_unavailable") : "product_unavailable",
    sourceError: coupangResult?.error || null,
  };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ status: "error", error: "id required" }, { status: 400 });

  const data = readJson(FILE);
  const items = Array.isArray(data?.items) ? data.items : [];
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return NextResponse.json({ status: "error", error: "draft not found" }, { status: 404 });

  const draft = items[index];
  const productResult = await importProduct(draft);
  const imported = productResult.imported;
  // 상품 사진 슬롯은 재사용 권한이 확인된 출처만 자동 연결한다: 쿠팡 파트너스 공식 소재(Open API) 또는
  // 초안에 productImageRights: "granted"로 표시된 경우. 제조사·일반 판매 페이지 이미지는 후보로만 기록하고 연결하지 않는다.
  const rightsOk = productResult.sourceStatus === "coupang_partners_open_api" || String(draft.productImageRights || "") === "granted";
  const withProductPhotos = imported && rightsOk ? productPhotoSlots(draft, imported, { max: 2 }) : (draft.images || []);
  const unlicensedCandidates = imported && !rightsOk ? (imported.imageCandidates || imported.images || imported.draft?.images || []).map(String).filter(Boolean).slice(0, 4) : [];
  const images = withProductPhotos.map((img, position) => img.role === "product_photo" ? img : ({
    ...img,
    src: String(img.src || "").trim() || `${GENERATED_PREFIX}${encodeURIComponent(draft.id)}/${encodeURIComponent(img.id || `image-${position + 1}`)}`,
    generatedLocally: true,
    generatedFormat: "png",
  }));

  // 파트너스 승인 후(Open API) 자동 연결된 공식 소재의 추적 링크를 신규 초안의 제휴 링크로 붙인다.
  // 승인 전에는 아무 링크도 만들지 않고 monetization 기록만 남긴다(일반 상품 링크/링크 없음으로 발행).
  const partners = coupangPartnersStatus();
  const officialLink = productResult.sourceStatus === "coupang_partners_open_api" ? String(imported?.source?.productUrl || "").trim() : "";
  const autoAffiliate = partners.autoLink && !String(draft.affiliateUrl || "").trim() && isPartnersLink(officialLink)
    ? {
        affiliateUrl: officialLink,
        coupangPartnersProduct: {
          productId: imported?.source?.productId ? String(imported.source.productId) : "",
          productName: String(imported?.source?.productName || "").trim(),
          linkedAt: new Date().toISOString(),
        },
      }
    : {};

  const productPhotosLinked = images.filter((img) => img.role === "product_photo" && String(img.src || "").trim()).length;
  const productPhotosMissing = images.filter((img) => img.role === "product_photo" && !String(img.src || "").trim()).length;

  items[index] = {
    ...draft,
    ...autoAffiliate,
    images,
    monetization: monetizationRecord({ ...draft, ...autoAffiliate }, partners),
    automationStatus: images.length ? "assets_planned" : draft.automationStatus,
    productImageStatus: productPhotosMissing ? "missing" : productPhotosLinked ? "linked" : draft.productImageStatus,
    productImageSourceStatus: unlicensedCandidates.length ? "rights_unverified" : productResult.sourceStatus,
    productImageSourceError: unlicensedCandidates.length
      ? `상품 이미지 후보 ${unlicensedCandidates.length}개를 찾았지만 재사용 권한이 확인되지 않아 연결하지 않았습니다(출처: ${productResult.sourceStatus}).`
      : productResult.sourceError || "",
    productImageCandidates: unlicensedCandidates,
    updatedAt: new Date().toISOString(),
  };
  writeJson(FILE, { items });

  return NextResponse.json({
    status: "ok",
    planned: images.filter((img) => String(img.src || "").startsWith(GENERATED_PREFIX)).length,
    productPhotosLinked,
    productPhotosMissing,
    productImageSourceStatus: items[index].productImageSourceStatus,
    productImageSourceError: items[index].productImageSourceError || null,
    source: imported?.source || null,
    partners: { stage: partners.stage, linkSource: partners.linkSource, reason: partners.reason },
    monetization: items[index].monetization,
    draft: items[index],
  });
}
