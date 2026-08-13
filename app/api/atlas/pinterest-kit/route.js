// PINTEREST_KIT — prepares the promotion material for one PUBLISHED article:
// a 2:3 image with the hook burned in, a pin title, an English description and
// the live link. Nothing is posted to Pinterest and nothing is re-published to
// Blogger; the record is kept so the same article always yields the same kit.
import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { buildPinterestKit } from "@/lib/atlas/pinterest-kit";

export const runtime = "nodejs";

const FILE = "pinterest-kits.json";

function readKits() {
  try {
    const data = readJson(FILE);
    return { ...data, kits: data.kits || [] };
  } catch {
    // First run — the store is created on the first successful build.
    return { kits: [] };
  }
}

function nextKitId(kits) {
  const max = kits.reduce((m, k) => {
    const match = /^pin_(\d+)$/.exec(k.id || "");
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `pin_${String(max + 1).padStart(3, "0")}`;
}

export async function GET() {
  return NextResponse.json({ status: "ok", kits: readKits().kits });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const articleId = body.articleId;
  if (!articleId) {
    return NextResponse.json({ status: "error", errorCode: "ARTICLE_ID_REQUIRED", message: "articleId가 필요합니다." }, { status: 400 });
  }

  const article = (readJson("articles.json").articles || []).find((a) => a.id === articleId);
  if (!article) {
    return NextResponse.json({ status: "error", errorCode: "ARTICLE_NOT_FOUND", message: `${articleId} 글을 찾을 수 없습니다.` }, { status: 404 });
  }

  // Idempotent per articleId: a second click returns the stored kit, so the
  // image URL, title, description and link never drift between two pins of the
  // same article, and no second record is written.
  const data = readKits();
  const existing = data.kits.find((k) => k.articleId === articleId);
  if (existing) return NextResponse.json({ status: "ok", duplicate: true, kit: existing });

  const { ok, issues, kit } = buildPinterestKit({ article });
  if (!ok) {
    return NextResponse.json({ status: "rejected", errorCode: "KIT_NOT_BUILDABLE", message: issues.join(" · "), issues }, { status: 422 });
  }

  const record = { id: nextKitId(data.kits), ...kit };
  data.kits.push(record);
  writeJson(FILE, data);
  return NextResponse.json({ status: "ok", duplicate: false, kit: record }, { status: 201 });
}
