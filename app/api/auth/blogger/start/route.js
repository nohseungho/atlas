import crypto from "crypto";
import { NextResponse } from "next/server";
import { readJson } from "@/lib/data-store";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";

const NONCE_COOKIE = "atlas_blogger_oauth_nonce";

export async function GET(request) {
  const blogId = request.nextUrl.searchParams.get("blogId");

  if (!blogId) {
    return NextResponse.json({ error: "blogId is required" }, { status: 400 });
  }

  const blogsData = readJson("blogs.json");
  const blog = blogsData.items.find((item) => item.id === blogId);

  if (!blog) {
    return NextResponse.json({ error: "blog not found" }, { status: 404 });
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ blogId, nonce })).toString("base64url");

  let authUrl;
  try {
    authUrl = bloggerProvider.buildAuthUrl(state);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    maxAge: 300,
    sameSite: "lax",
  });

  return response;
}
