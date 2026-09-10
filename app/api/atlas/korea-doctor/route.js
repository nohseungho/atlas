import { NextResponse } from "next/server";
import { getNaverAutomationDoctor } from "@/lib/atlas/naver-browser-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = getNaverAutomationDoctor();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
