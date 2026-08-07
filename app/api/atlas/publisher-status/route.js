// Publisher state, read from server data only (no Blogger call). This is what the
// Publisher screen loads on mount and after every action, so publish state /
// postId / URL / publish time / approval survive a refresh and a browser restart.
import { NextResponse } from "next/server";
import { buildPublisherView } from "@/lib/atlas/publisher-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const view = buildPublisherView();
  return NextResponse.json({ status: "ok", ...view });
}
