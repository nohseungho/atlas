import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { KOREA_DRAFT_STATE, canPublishKoreaDraft, validateKoreaDraft } from "@/lib/atlas/korea-product-pipeline";
import { runNaverBrowserJob } from "@/lib/atlas/naver-browser-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = "korea-drafts.json";
const inFlight = new Set();

function readItems() {
  const data = readJson(FILE);
  return Array.isArray(data?.items) ? data.items : [];
}

function save(items) {
  writeJson(FILE, { items });
}

function patch(items, id, values) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  items[index] = { ...items[index], ...values, updatedAt: new Date().toISOString() };
  save(items);
  return items[index];
}

function missingRequiredImages(draft) {
  return (draft.images || []).filter((img) => !String(img.src || "").trim()).map((img) => img.id || img.role || "image");
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const mode = body.mode === "publish" ? "publish" : "stage";
  if (!id) return NextResponse.json({ status: "error", error: "id required" }, { status: 400 });

  const items = readItems();
  const draft = items.find((item) => item.id === id);
  if (!draft) return NextResponse.json({ status: "error", error: "draft not found" }, { status: 404 });

  const validation = validateKoreaDraft(draft);
  if (!validation.ok) {
    return NextResponse.json({ status: "rejected", issues: validation.issues }, { status: 400 });
  }

  const missingImages = missingRequiredImages(draft);
  if (missingImages.length) {
    return NextResponse.json({
      status: "assets_required",
      errorCode: "NAVER_IMAGE_ASSETS_REQUIRED",
      missingImages,
      error: `본문 이미지 ${missingImages.length}개가 아직 로컬 파일과 연결되지 않았습니다.`,
    }, { status: 409 });
  }

  if (mode === "publish" && !canPublishKoreaDraft(draft)) {
    return NextResponse.json({ status: "rejected", errorCode: "APPROVAL_REQUIRED", error: "최종 발행 승인 상태에서만 실제 네이버 발행을 실행합니다." }, { status: 409 });
  }

  if (draft.state === KOREA_DRAFT_STATE.PUBLISHED) {
    return NextResponse.json({ status: "duplicate", errorCode: "ALREADY_PUBLISHED", publishedUrl: draft.publishedUrl || "" }, { status: 409 });
  }

  if (inFlight.has(id)) {
    return NextResponse.json({ status: "in_progress", errorCode: "PUBLISH_IN_PROGRESS" }, { status: 409 });
  }

  inFlight.add(id);
  if (mode === "publish") patch(items, id, { state: KOREA_DRAFT_STATE.PUBLISHING, lastError: "" });

  try {
    const result = await runNaverBrowserJob(draft, { publish: mode === "publish" });

    if (result.status === "login_required") {
      const fresh = readItems();
      patch(fresh, id, {
        state: mode === "publish" ? KOREA_DRAFT_STATE.APPROVED : draft.state,
        lastError: result.message,
        automationStatus: "login_required",
      });
      return NextResponse.json(result, { status: 200 });
    }

    const fresh = readItems();
    if (mode === "publish") {
      patch(fresh, id, {
        state: KOREA_DRAFT_STATE.PUBLISHED,
        publishedAt: new Date().toISOString(),
        publishedUrl: result.publishedUrl || "",
        lastError: "",
        automationStatus: "published",
      });
    } else {
      patch(fresh, id, {
        automationStatus: "staged",
        stagedAt: new Date().toISOString(),
        stagedEditorUrl: result.editorUrl || "",
        lastError: "",
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    const fresh = readItems();
    patch(fresh, id, {
      state: mode === "publish" ? KOREA_DRAFT_STATE.APPROVED : draft.state,
      lastError: String(error?.message || error),
      automationStatus: "failed",
    });
    return NextResponse.json({
      status: "failed",
      errorCode: error?.code || "NAVER_AUTOMATION_FAILED",
      error: String(error?.message || error),
    }, { status: 500 });
  } finally {
    inFlight.delete(id);
  }
}
