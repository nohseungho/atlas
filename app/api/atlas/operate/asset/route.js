// 미리보기 전용 로컬 이미지 스트림.
//
// 경로를 통째로 받지 않고 draft/image 식별자만 받아 고정 세그먼트로 조립한다.
// 임의 경로를 path.resolve에 넘기면 디렉터리 밖 파일을 노릴 여지가 생기고,
// 빌드 추적기도 프로젝트 전체가 추적된 것으로 보고 경고를 낸다.
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXTENSIONS = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
]);

// 식별자에는 경로 구분자와 점을 아예 허용하지 않는다. ".."가 만들어질 수 없다.
function safeId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : "";
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const draft = safeId(params.get("draft"));
  const image = safeId(params.get("image"));
  const ext = String(params.get("ext") || "png").toLowerCase();
  const type = EXTENSIONS.get(ext);
  if (!draft || !image || !type) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const file = path.join(process.cwd(), ".atlas-data", "korea-assets", draft, `${image}.${ext}`);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return new NextResponse(fs.readFileSync(file), {
    headers: { "Content-Type": type, "Cache-Control": "no-store" },
  });
}
