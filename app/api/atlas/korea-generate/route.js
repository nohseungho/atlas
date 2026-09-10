import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { generateKoreaProductArticle, generatePhilips3000KettleArticle } from "@/lib/atlas/korea-content-generator";

export const runtime = "nodejs";
const FILE = "korea-drafts.json";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ status: "error", error: "id required" }, { status: 400 });

  const data = readJson(FILE);
  const items = Array.isArray(data?.items) ? data.items : [];
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return NextResponse.json({ status: "error", error: "draft not found" }, { status: 404 });

  const current = items[index];
  if (current.contentType === "existing_post_update" && current.updateMode === "images_only") {
    return NextResponse.json({ status: "skipped", draft: current, message: "기존 글 본문은 보존하고 이미지 자동 반영만 수행합니다." });
  }

  const generated = /philips.*3000|필립스.*3000/i.test(`${current.id} ${current.productName} ${current.title}`)
    ? generatePhilips3000KettleArticle(current)
    : generateKoreaProductArticle(current);

  const next = {
    ...current,
    ...generated,
    state: "ready_for_review",
    automationStatus: "content_ready",
    updatedAt: new Date().toISOString(),
  };
  items[index] = next;
  writeJson(FILE, { items });
  return NextResponse.json({ status: "ok", draft: next });
}
