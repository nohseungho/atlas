import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = "korea-drafts.json";
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

function safePart(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

export async function POST(request) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid multipart form" }, { status: 400 });

  const draftId = String(form.get("draftId") || "").trim();
  const imageId = String(form.get("imageId") || "").trim();
  const file = form.get("file");
  if (!draftId || !imageId || !(file instanceof File)) {
    return NextResponse.json({ error: "draftId, imageId, file required" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES.get(file.type);
  if (!ext) return NextResponse.json({ error: "jpg, png, webp 이미지만 업로드할 수 있습니다." }, { status: 415 });
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "이미지 파일은 12MB 이하만 가능합니다." }, { status: 413 });
  }

  const data = readJson(FILE);
  const items = Array.isArray(data?.items) ? data.items : [];
  const index = items.findIndex((item) => item.id === draftId);
  if (index < 0) return NextResponse.json({ error: "draft not found" }, { status: 404 });

  const draft = items[index];
  const imageIndex = (draft.images || []).findIndex((img) => img.id === imageId);
  if (imageIndex < 0) return NextResponse.json({ error: "image slot not found" }, { status: 404 });

  const dir = path.join(process.cwd(), ".atlas-data", "korea-assets", safePart(draftId));
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${safePart(imageId)}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(target, buffer);

  const images = [...(draft.images || [])];
  images[imageIndex] = {
    ...images[imageIndex],
    src: target,
    uploadedAt: new Date().toISOString(),
    originalName: String(file.name || ""),
  };
  items[index] = {
    ...draft,
    images,
    automationStatus: images.every((img) => String(img.src || "").trim()) ? "assets_ready" : "assets_required",
    updatedAt: new Date().toISOString(),
  };
  writeJson(FILE, { items });

  return NextResponse.json({
    status: "ok",
    draft: items[index],
    image: images[imageIndex],
  });
}
