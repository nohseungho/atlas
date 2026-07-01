import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";

const FILE = "blogs.json";

// 주의: OAuth 토큰/refresh token은 이 파일(blogs.json)에 절대 저장하지 않는다.
// 토큰은 별도 Token Store(추후 설계, docs/blogger-auto-publish-design.md 참고)에
// 분리해서 저장하고, blog record는 참조 필드만 가지는 구조로 간다.

export async function GET() {
  const data = readJson(FILE);
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();

  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const data = readJson(FILE);
  const now = new Date().toISOString();

  const maxNum = data.items.reduce((max, item) => {
    const match = /^blog_(\d+)$/.exec(item.id || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const blog = {
    id: `blog_${String(maxNum + 1).padStart(3, "0")}`,
    name: body.name,
    platform: body.platform || "blogger",
    url: body.url || "",
    bloggerBlogId: body.bloggerBlogId || "",
    categoryFocus: body.categoryFocus || "",
    status: "ready",
    memo: body.memo || "",
    createdAt: now,
    updatedAt: now,
  };

  data.items.push(blog);
  writeJson(FILE, data);

  return NextResponse.json(blog, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json();

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data = readJson(FILE);
  const blog = data.items.find((item) => item.id === body.id);

  if (!blog) {
    return NextResponse.json({ error: "blog not found" }, { status: 404 });
  }

  if (body.status) blog.status = body.status;
  if (typeof body.url === "string") blog.url = body.url;
  if (typeof body.bloggerBlogId === "string") blog.bloggerBlogId = body.bloggerBlogId;
  if (typeof body.memo === "string") blog.memo = body.memo;
  blog.updatedAt = new Date().toISOString();

  writeJson(FILE, data);

  return NextResponse.json(blog);
}
