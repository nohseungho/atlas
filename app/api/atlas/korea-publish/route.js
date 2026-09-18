import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { KOREA_DRAFT_STATE, canPublishKoreaDraft, publishBlockers, validateKoreaDraft } from "@/lib/atlas/korea-product-pipeline";
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
  // product_photo ?щ’? ?ㅼ젣 ?쒗뭹 ?ъ쭊???곌껐???뚮쭔 ?낅줈?쒗븯硫? 鍮꾩뼱 ?덉뼱??諛섏쁺??留됱? ?딅뒗??
  return (draft.images || []).filter((img) => img.role !== "product_photo" && img.optional !== true && img.required !== false && !String(img.src || "").trim()).map((img) => img.id || img.role || "image");
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
      error: `蹂몃Ц ?대?吏 ${missingImages.length}媛쒓? ?꾩쭅 濡쒖뺄 ?뚯씪怨??곌껐?섏? ?딆븯?듬땲??`,
    }, { status: 409 });
  }

  if (mode === "publish" && !canPublishKoreaDraft(draft)) {
    return NextResponse.json({ status: "rejected", errorCode: "APPROVAL_REQUIRED", error: "理쒖쥌 諛쒗뻾 ?뱀씤 ?곹깭?먯꽌留??ㅼ젣 ?ㅼ씠踰?諛쒗뻾???ㅽ뻾?⑸땲??" }, { status: 409 });
  }

  const blockers = mode === "publish" ? publishBlockers(draft) : [];
  if (blockers.length) {
    return NextResponse.json({ status: "rejected", errorCode: "MONETIZATION_REQUIRED", blockers, error: `?쒗쑕留곹겕? ?곌껐???대?吏媛 ?덉뼱???ㅼ젣 諛쒗뻾?⑸땲?? ${blockers.join(", ")}` }, { status: 409 });
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
