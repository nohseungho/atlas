// CHATGPT_HANDOFF — register an atlas-keyword-package returned by ChatGPT.
// Validates each candidate (English-only, Blog 01 niche, semantic dedup) and
// adds only the accepted ones to the existing Money Hunter DB (keywords.json).
// searchVolume/CPC are stored as UNKNOWN (never fabricated). Idempotent: a
// re-registered package adds no duplicate candidates (dedup by normalized keyword).
import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { validateKeywordPackage } from "@/lib/atlas/chatgpt-handoff";

export const runtime = "nodejs";

function nextKeywordId(keywords) {
  const max = keywords.reduce((m, k) => {
    const match = /^kw_(\d+)$/.exec(k.id || "");
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `kw_${String(max + 1).padStart(3, "0")}`;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const pkg = body.package || body;
  if (!pkg || typeof pkg !== "object") {
    return NextResponse.json({ status: "error", errorCode: "PACKAGE_REQUIRED" }, { status: 400 });
  }
  const blogId = pkg.blogId || "blog_001";

  const existingArticles = readJson("articles.json").articles || [];
  const keywordsData = readJson("keywords.json");
  const existingCandidates = keywordsData.keywords || [];

  const result = validateKeywordPackage(pkg, {
    requestJobId: pkg.jobId,
    blogId,
    existingArticles,
    existingCandidates,
  });
  if (!result.ok) {
    return NextResponse.json({ status: "rejected", errorCode: "PACKAGE_INVALID", errors: result.errors, rejected: result.rejected }, { status: 400 });
  }

  // Add only accepted candidates. UNKNOWN volume/CPC — never fabricated numbers.
  const now = new Date().toISOString();
  const added = [];
  for (const c of result.accepted) {
    const id = nextKeywordId(keywordsData.keywords);
    const record = {
      id,
      keyword: c.keyword,
      category: c.category || "Travel",
      intent: c.searchIntentKey || "informational",
      // Verified numeric levels are unknown from a research handoff → not fabricated.
      searchVolumeLevel: null,
      cpcLevel: null,
      competitionLevel: null,
      commercialLevel: null,
      seasonality: null,
      searchVolume: "UNKNOWN",
      cpc: "UNKNOWN",
      moneyScore: null,
      // Structured discovery fields (used by content-handoff dedup + selection).
      coreQuestion: c.coreQuestion || "",
      searchIntentKey: c.searchIntentKey || "",
      topicEntities: c.topicEntities || [],
      desiredReaderAction: c.desiredReaderAction || "",
      commercialIntent: c.commercialIntent || "",
      affiliatePotential: c.affiliatePotential || "",
      competition: c.competitionLevel || "",
      trendEvidence: c.trendEvidence || "",
      sources: (c.sources || []).map((s) => (typeof s === "string" ? { url: s } : s)),
      status: "idea",
      source: "chatgpt-keyword-handoff",
      handoffJobId: pkg.jobId || "",
      memo: "",
      createdAt: now,
      updatedAt: now,
    };
    keywordsData.keywords.push(record);
    added.push({ id, keyword: c.keyword });
  }
  if (added.length) writeJson("keywords.json", keywordsData);

  return NextResponse.json({
    status: "ok",
    added: added.length,
    addedKeywords: added,
    rejected: result.rejected,
    review: result.review,
  });
}
