import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = "korea-drafts.json";
const GENERATED_PREFIX = "atlas-generated://";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ status: "error", error: "id required" }, { status: 400 });

  const data = readJson(FILE);
  const items = Array.isArray(data?.items) ? data.items : [];
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return NextResponse.json({ status: "error", error: "draft not found" }, { status: 404 });

  const draft = items[index];
  const images = (draft.images || []).map((img, position) => img.role === "product_photo" ? img : ({
    ...img,
    src: String(img.src || "").trim() || `${GENERATED_PREFIX}${encodeURIComponent(draft.id)}/${encodeURIComponent(img.id || `image-${position + 1}`)}`,
    generatedLocally: true,
    generatedFormat: "png",
  }));

  items[index] = {
    ...draft,
    images,
    automationStatus: images.length ? "assets_planned" : draft.automationStatus,
    updatedAt: new Date().toISOString(),
  };
  writeJson(FILE, { items });

  return NextResponse.json({
    status: "ok",
    planned: images.filter((img) => String(img.src || "").startsWith(GENERATED_PREFIX)).length,
    draft: items[index],
  });
}
