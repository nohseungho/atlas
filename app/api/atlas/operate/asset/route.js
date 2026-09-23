// 미리보기 전용 로컬 이미지 스트림.
// .atlas-data/korea-assets/ 아래의 파일만 내보낸다. 다른 경로는 어떤 형태로도 열지 않는다.
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_BASE = () => path.join(process.cwd(), ".atlas-data", "korea-assets");

const TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

export async function GET(request) {
  const src = new URL(request.url).searchParams.get("src") || "";
  const resolved = path.resolve(src);
  const base = ALLOWED_BASE() + path.sep;
  if (!resolved.startsWith(base)) {
    return NextResponse.json({ error: "FORBIDDEN_PATH" }, { status: 403 });
  }
  const type = TYPES.get(path.extname(resolved).toLowerCase());
  if (!type || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return new NextResponse(fs.readFileSync(resolved), {
    headers: { "Content-Type": type, "Cache-Control": "no-store" },
  });
}
