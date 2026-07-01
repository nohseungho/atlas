import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";
import { upsertTokenForBlog } from "@/lib/atlas/repositories/token-repository";

const NONCE_COOKIE = "atlas_blogger_oauth_nonce";

export async function GET(request) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const redirectTo = new URL("/blog-manager", request.url);

  function redirectWithError(message) {
    redirectTo.searchParams.set("blogAuth", "error");
    redirectTo.searchParams.set("message", message);
    const response = NextResponse.redirect(redirectTo);
    response.cookies.delete(NONCE_COOKIE);
    return response;
  }

  if (oauthError) {
    return redirectWithError(oauthError);
  }

  if (!code || !state) {
    return redirectWithError("missing code or state");
  }

  let parsedState;
  try {
    parsedState = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
  } catch {
    return redirectWithError("invalid state");
  }

  const cookieNonce = request.cookies.get(NONCE_COOKIE)?.value;
  if (!cookieNonce || cookieNonce !== parsedState.nonce) {
    return redirectWithError("nonce mismatch");
  }

  const { blogId } = parsedState;

  try {
    const tokens = await bloggerProvider.exchangeAuthCode(code);
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();

    const tokenRecord = upsertTokenForBlog({
      blogId,
      provider: "blogger",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      scope: tokens.scope,
      expiresAt,
    });

    const blogsData = readJson("blogs.json");
    const blog = blogsData.items.find((item) => item.id === blogId);
    if (blog) {
      blog.tokenRef = tokenRecord.id;
      blog.updatedAt = new Date().toISOString();
      writeJson("blogs.json", blogsData);
    }

    redirectTo.searchParams.set("blogAuth", "success");
    redirectTo.searchParams.set("blogId", blogId);
    const response = NextResponse.redirect(redirectTo);
    response.cookies.delete(NONCE_COOKIE);
    return response;
  } catch (error) {
    return redirectWithError(error.message || "token exchange failed");
  }
}
