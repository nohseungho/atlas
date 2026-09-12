import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { isCoupangUrl, productPhotoSlots } from "@/lib/atlas/korea-product-auto";
import { findCoupangPartnersProduct } from "@/lib/atlas/coupang-partners";

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
      signal: AbortSignal.timeout(15_000),
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

  if (coupang) {
    coupangResult = await findCoupangPartnersProduct({ productName: draft.productName, limit: 10 });
    if (coupangResult?.ok && coupangResult.imageCandidates?.length) {
      return {
        imported: coupangResult,
        sourceStatus: "coupang_partners_open_api",
        sourceError: null,
      };
    }
  }

  const generic = await importGenericProduct(draft);
  if (generic) {
    return {
      imported: generic,
      sourceStatus: coupang ? "generic_fallback" : "generic_product_page",
      sourceError: coupangResult?.error || null,
    };
  }

  return {
    imported: null,
    sourceStatus: coupang ? (coupangResult?.code || "coupang_product_unavailable") : "product_unavailable",
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
  const withProductPhotos = imported ? productPhotoSlots(draft, imported, { max: 2 }) : (draft.images || []);
  const images = withProductPhotos.map((img, position) => img.role === "product_photo" ? img : ({
    ...img,
    src: String(img.src || "").trim() || `${GENERATED_PREFIX}${encodeURIComponent(draft.id)}/${encodeURIComponent(img.id || `image-${position + 1}`)}`,
    generatedLocally: true,
    generatedFormat: "png",
  }));

  const productPhotosLinked = images.filter((img) => img.role === "product_photo" && String(img.src || "").trim()).length;
  const productPhotosMissing = images.filter((img) => img.role === "product_photo" && !String(img.src || "").trim()).length;

  items[index] = {
    ...draft,
    images,
    automationStatus: images.length ? "assets_planned" : draft.automationStatus,
    productImageStatus: productPhotosMissing ? "missing" : productPhotosLinked ? "linked" : draft.productImageStatus,
    productImageSourceStatus: productResult.sourceStatus,
    productImageSourceError: productResult.sourceError || "",
    updatedAt: new Date().toISOString(),
  };
  writeJson(FILE, { items });

  return NextResponse.json({
    status: "ok",
    planned: images.filter((img) => String(img.src || "").startsWith(GENERATED_PREFIX)).length,
    productPhotosLinked,
    productPhotosMissing,
    productImageSourceStatus: productResult.sourceStatus,
    productImageSourceError: productResult.sourceError || null,
    source: imported?.source || null,
    draft: items[index],
  });
}
