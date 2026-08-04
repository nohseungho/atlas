import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { calculateMoneyScore } from "@/lib/money-score";

const FILE = "keywords.json";
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;

// A keyword is "used" (delete-protected) if it is no longer a raw idea, or if any
// article or production job references it. Read-only checks against real data.
function isKeywordUsed(kw) {
  if (kw.status && kw.status !== "idea") return true;
  let articles = [];
  let jobs = [];
  try { articles = readJson("articles.json").articles || []; } catch { articles = []; }
  try { jobs = readJson("production-jobs.json").jobs || []; } catch { jobs = []; }
  const byArticle = articles.some((a) => a.keywordId === kw.id || a.moneyHunterId === kw.id);
  const byJob = jobs.some((j) => j.moneyHunterId === kw.id);
  return byArticle || byJob;
}

export async function GET() {
  const data = readJson(FILE);
  let articles = [];
  let jobs = [];
  try { articles = readJson("articles.json").articles || []; } catch { articles = []; }
  try { jobs = readJson("production-jobs.json").jobs || []; } catch { jobs = []; }
  // Annotate (computed, NOT persisted) usage so the UI can show 미사용 /
  // 제작 요청 완료 · pjob_XXX without changing stored ids or links.
  const keywords = (data.keywords || []).map((k) => {
    const job = jobs.find((j) => j.moneyHunterId === k.id);
    const art = articles.find((a) => a.keywordId === k.id || a.moneyHunterId === k.id);
    const used = (k.status && k.status !== "idea") || Boolean(job) || Boolean(art);
    return { ...k, usage: { used, pjob: job?.id || null, articleId: art?.id || null } };
  });
  return NextResponse.json({ ...data, keywords });
}

export async function POST(request) {
  const body = await request.json();

  if (!body.keyword || !body.category) {
    return NextResponse.json(
      { error: "keyword and category are required" },
      { status: 400 }
    );
  }

  // Blog 01 is an English overseas blog — reject Korean-language keywords.
  if (HANGUL.test(body.keyword)) {
    return NextResponse.json(
      { error: "한글 키워드는 해외 영어 블로그(Blog 01)에서 거부됩니다.", errorCode: "KOREAN_KEYWORD_REJECTED" },
      { status: 400 }
    );
  }

  const data = readJson(FILE);
  const now = new Date().toISOString();

  const maxNum = data.keywords.reduce((max, item) => {
    const match = /^kw_(\d+)$/.exec(item.id || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const levels = {
    searchVolumeLevel: Number(body.searchVolumeLevel) || 1,
    cpcLevel: Number(body.cpcLevel) || 1,
    competitionLevel: Number(body.competitionLevel) || 1,
    commercialLevel: Number(body.commercialLevel) || 1,
    seasonality: Number(body.seasonality) || 1,
  };

  const keyword = {
    id: `kw_${String(maxNum + 1).padStart(3, "0")}`,
    keyword: body.keyword,
    category: body.category,
    intent: body.intent || "informational",
    ...levels,
    moneyScore: calculateMoneyScore(levels),
    status: "idea",
    source: "manual",
    memo: body.memo || "",
    createdAt: now,
    updatedAt: now,
  };

  data.keywords.push(keyword);
  writeJson(FILE, data);

  return NextResponse.json(keyword, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json();

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data = readJson(FILE);
  const keyword = data.keywords.find((item) => item.id === body.id);

  if (!keyword) {
    return NextResponse.json({ error: "keyword not found" }, { status: 404 });
  }

  if (body.status) keyword.status = body.status;
  if (typeof body.memo === "string") keyword.memo = body.memo;
  keyword.updatedAt = new Date().toISOString();

  writeJson(FILE, data);

  return NextResponse.json(keyword);
}

// DELETE — remove UNUSED keywords only. Two modes:
//   { id }         → delete one unused keyword (blocked if used).
//   { bulkKorean } → delete every UNUSED Korean (Hangul) keyword; English and
//                    used-history keywords are never touched.
export async function DELETE(request) {
  const body = await request.json().catch(() => ({}));
  const data = readJson(FILE);

  if (body.bulkKorean) {
    const targets = (data.keywords || []).filter((k) => HANGUL.test(k.keyword || "") && !isKeywordUsed(k));
    if (targets.length === 0) {
      return NextResponse.json({ status: "ok", deleted: 0, message: "삭제할 미사용 한글 키워드가 없습니다." });
    }
    const ids = new Set(targets.map((k) => k.id));
    data.keywords = data.keywords.filter((k) => !ids.has(k.id));
    writeJson(FILE, data);
    return NextResponse.json({ status: "ok", deleted: ids.size, deletedKeywords: targets.map((k) => ({ id: k.id, keyword: k.keyword })) });
  }

  if (!body.id) return NextResponse.json({ status: "error", errorCode: "ID_REQUIRED" }, { status: 400 });
  const keyword = (data.keywords || []).find((k) => k.id === body.id);
  if (!keyword) return NextResponse.json({ status: "error", errorCode: "NOT_FOUND" }, { status: 404 });
  if (isKeywordUsed(keyword)) {
    return NextResponse.json({ status: "blocked", message: "사용 기록이 있어 삭제할 수 없습니다." }, { status: 409 });
  }
  data.keywords = data.keywords.filter((k) => k.id !== body.id);
  writeJson(FILE, data);
  return NextResponse.json({ status: "ok", deleted: 1, id: body.id, keyword: keyword.keyword });
}
