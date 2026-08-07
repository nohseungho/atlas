// Read-only Blogger status sync endpoint. Reconciles EVERY ATLAS article with the
// blog's real LIVE posts (stores bloggerPostId/status/url/publishedAt) and reports
// LIVE posts that belong to no article as external posts. Never publishes,
// modifies, or deletes any Blogger post. Requires a connected (non-expired) token;
// on OAuth failure it returns BLOGGER_RECONNECT_REQUIRED and changes no data.
import { NextResponse } from "next/server";
import { syncPublishedArticles } from "@/lib/atlas/blogger-sync";
import { buildPublisherView } from "@/lib/atlas/publisher-state";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const blogId = body.blogId || "blog_001";
  const { rows: syncRows, counts: syncCounts, ...result } = await syncPublishedArticles(blogId);

  const httpStatus = result.status === "error" ? 500 : result.status === "reconnect_required" ? 401 : 200;

  // The view is rebuilt from the just-written server data, so what the screen
  // renders is exactly what a plain refresh would render.
  return NextResponse.json({ ...result, syncRows, syncCounts, ...buildPublisherView() }, { status: httpStatus });
}
