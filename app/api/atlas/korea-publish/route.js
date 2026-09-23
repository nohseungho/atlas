import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { KOREA_DRAFT_STATE, canPublishKoreaDraft, canonicalNaverUrl, publishBlockers, validateKoreaDraft } from "@/lib/atlas/korea-product-pipeline";
import { runNaverBrowserJob } from "@/lib/atlas/naver-browser-publisher";
import { evaluateKoreaDraft } from "@/lib/atlas/policy-validator";
import { checkUserApproval } from "@/lib/atlas/operate/publish-approval-store";

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

  // Operating-policy gate (lib/atlas/operating-policy.js): 수호 캐릭터 고정,
  // 보호글 logNo, 기발행 중복, 필수 수호 이미지. 첫 위반 코드로 차단한다.
  // 발행(publish)뿐 아니라 편집기 스테이징(stage)에도 같은 규칙을 적용한다.
  const policy = evaluateKoreaDraft(draft);
  if (!policy.ok) {
    const first = policy.blocking[0];
    const missingImages = first.code === "NAVER_IMAGE_ASSETS_REQUIRED" ? first.detail.replace(/^missing:\s*/, "").split(", ") : undefined;
    return NextResponse.json({
      status: first.code === "NAVER_IMAGE_ASSETS_REQUIRED" ? "assets_required" : first.code === "ALREADY_PUBLISHED" ? "duplicate" : "rejected",
      errorCode: first.code,
      missingImages,
      publishedUrl: first.code === "ALREADY_PUBLISHED" ? draft.publishedUrl || "" : undefined,
      policy: policy.results,
      error: missingImages
        ? `본문 이미지 ${missingImages.length}개가 아직 로컬 파일과 연결되지 않았습니다.`
        : `운영 정책 위반으로 중단했습니다: ${first.id}${first.detail ? ` (${first.detail})` : ""}`,
    }, { status: 409 });
  }

  if (mode === "publish" && !canPublishKoreaDraft(draft)) {
    return NextResponse.json({ status: "rejected", errorCode: "APPROVAL_REQUIRED", error: "최종 발행 승인 상태에서만 실제 네이버 발행을 실행합니다." }, { status: 409 });
  }

  const blockers = mode === "publish" ? publishBlockers(draft) : [];
  if (blockers.length) {
    return NextResponse.json({ status: "rejected", errorCode: "MONETIZATION_REQUIRED", blockers, error: `실제 발행 조건이 부족합니다(연결된 이미지 필수, 파트너스 승인 후에는 제휴 링크 필수): ${blockers.join(", ")}` }, { status: 409 });
  }

  // 사용자 발행 승인 — 자동 발행 금지(2026-09-24). 최종 검수 화면에서 사용자가 "발행"을 눌러
  // 남긴 승인(내용 해시 일치·15분 이내·1회용)이 없으면 네이버 발행을 실행하지 않는다.
  // 스테이징(편집기에 올려두기만 함)은 공개가 아니므로 승인 없이 허용한다.
  if (mode === "publish") {
    const approval = checkUserApproval("korea", draft);
    if (approval.issues.length) {
      return NextResponse.json({ status: "rejected", errorCode: "USER_PUBLISH_APPROVAL_REQUIRED", error: approval.issues[0], issues: approval.issues }, { status: 409 });
    }
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
        publishedUrl: canonicalNaverUrl(result.publishedUrl, draft.blogId) || "",
        lastError: "",
        automationStatus: "published",
        userPublishApproval: { ...(draft.userPublishApproval || {}), usedAt: new Date().toISOString() },
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
      // 실패해도 공개가 일부 진행됐을 수 있으므로 같은 승인으로 다시 발행하지 않는다.
      ...(mode === "publish" ? { userPublishApproval: { ...(draft.userPublishApproval || {}), usedAt: new Date().toISOString() } } : {}),
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
