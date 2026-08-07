// Approval gate for auto-publish. Approval is recorded server-side in
// articles.json, so /api/publish can verify it independently of the browser.
import { NextResponse } from "next/server";
import { setApproval, buildPublisherView } from "@/lib/atlas/publisher-state";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { articleId, action } = body;

  if (!articleId || !["approve", "revoke"].includes(action)) {
    return NextResponse.json({ status: "error", errorCode: "BAD_REQUEST" }, { status: 400 });
  }

  const result = setApproval(articleId, action === "approve");
  if (!result.ok) {
    return NextResponse.json(
      { status: "error", errorCode: result.errorCode, publishState: result.publishState },
      { status: result.errorCode === "ARTICLE_NOT_FOUND" ? 404 : 409 }
    );
  }

  return NextResponse.json({ status: "ok", ...result, ...buildPublisherView() });
}
