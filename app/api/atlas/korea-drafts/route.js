import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import {
  KOREA_DRAFT_STATE,
  canApproveKoreaDraft,
  normalizeKoreaDraft,
  validateKoreaDraft,
} from "@/lib/atlas/korea-product-pipeline";

export const runtime = "nodejs";

const FILE = "korea-drafts.json";

function readItems() {
  const data = readJson(FILE);
  return Array.isArray(data?.items) ? data.items : [];
}

function writeItems(items) {
  writeJson(FILE, { items });
}

export async function GET() {
  return NextResponse.json({ items: readItems() });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const draft = normalizeKoreaDraft(body);
  const validation = validateKoreaDraft(draft);
  if (!validation.ok) {
    return NextResponse.json({ status: "rejected", issues: validation.issues }, { status: 400 });
  }
  const items = readItems();
  if (items.some((item) => item.id === draft.id)) {
    return NextResponse.json({ status: "duplicate", id: draft.id }, { status: 409 });
  }
  items.unshift(draft);
  writeItems(items);
  return NextResponse.json({ status: "ok", draft }, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const action = String(body.action || "save");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const items = readItems();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return NextResponse.json({ error: "draft not found" }, { status: 404 });

  let next = { ...items[index], ...body.patch, id, updatedAt: new Date().toISOString() };

  if (action === "review") {
    const validation = validateKoreaDraft(next);
    if (!validation.ok) {
      return NextResponse.json({ status: "rejected", issues: validation.issues }, { status: 400 });
    }
    next.state = KOREA_DRAFT_STATE.READY_FOR_REVIEW;
  }

  if (action === "approve") {
    if (!canApproveKoreaDraft(next)) {
      return NextResponse.json({ status: "rejected", error: "READY_FOR_REVIEW 상태에서만 승인할 수 있습니다." }, { status: 409 });
    }
    next.state = KOREA_DRAFT_STATE.APPROVED;
    next.approvedAt = new Date().toISOString();
  }

  if (action === "reset") {
    next.state = KOREA_DRAFT_STATE.DRAFT;
    next.approvedAt = "";
  }

  items[index] = next;
  writeItems(items);
  return NextResponse.json({ status: "ok", draft: next });
}
