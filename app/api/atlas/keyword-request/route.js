// CHATGPT_HANDOFF — export a secret-free English keyword-discovery request
// (atlas-keyword-request-{jobId}.json) for Blog 01. No generation API is called.
import { NextResponse } from "next/server";
import { readJson } from "@/lib/data-store";
import { buildKeywordRequest, automationMode } from "@/lib/atlas/chatgpt-handoff";

export const runtime = "nodejs";

const PERSONA = "US Tourist";
const TEMPLATE = "guide";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const blogId = body.blogId || "blog_001";

  const blog = (readJson("blogs.json").items || []).find((b) => b.id === blogId) || { id: blogId, name: blogId };
  const existingArticles = readJson("articles.json").articles || [];
  const existingCandidates = readJson("keywords.json").keywords || [];
  const jobId = `kwreq_${Date.now().toString(36)}`;

  const req = buildKeywordRequest({
    jobId,
    blog,
    existingArticles,
    existingCandidates,
    persona: PERSONA,
    template: TEMPLATE,
  });

  return NextResponse.json({
    status: "ok",
    mode: automationMode(),
    jobId,
    filename: `atlas-keyword-request-${jobId}.json`,
    request: req,
  });
}
