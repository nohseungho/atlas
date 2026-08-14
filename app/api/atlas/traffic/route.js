// TRAFFIC — 6단계 “트래픽 배포”. Prepares the Pinterest / internal-link / Google
// material for one PUBLISHED article and stores the operator's own manual
// records (Search Console verdict, 7일·30일 성과).
//
// Nothing is posted to Pinterest, nothing is sent to Google, no Blogger post is
// edited, and no OAuth or paid API is involved. articles.json, publishing.json
// and pinterest-kits.json are read-only here; only traffic.json is written.
import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import {
  buildTrafficKit,
  emptyRecord,
  normalizeMetrics,
  normalizePostState,
  normalizeSearchCheck,
  upsertRecord,
  withPostingDefaults,
  VARIANTS,
} from "@/lib/atlas/traffic-kit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = "traffic.json";

function readTraffic() {
  try {
    const data = readJson(FILE);
    return { ...data, records: data.records || [] };
  } catch {
    // First run — the store is created on the first save.
    return { records: [] };
  }
}

function recordFor(data, articleId) {
  return data.records.find((r) => r.articleId === articleId) || null;
}

function loadKit(articleId, now = new Date()) {
  const articles = readJson("articles.json").articles || [];
  const article = articles.find((a) => a.id === articleId) || null;
  let storedKit = null;
  try {
    storedKit = (readJson("pinterest-kits.json").kits || []).find((k) => k.articleId === articleId) || null;
  } catch {
    // 기존 Pinterest kit이 아직 없으면 새로 구성한다.
  }
  const record = recordFor(readTraffic(), articleId);
  return buildTrafficKit({ article, articles, storedKit, record, now });
}

export async function GET(request) {
  const articleId = new URL(request.url).searchParams.get("articleId");
  if (!articleId) {
    return NextResponse.json({ status: "error", errorCode: "ARTICLE_ID_REQUIRED" }, { status: 400 });
  }
  const result = loadKit(articleId);
  if (!result.ok) {
    return NextResponse.json({ status: "unavailable", reason: result.reason, record: recordFor(readTraffic(), articleId) }, { status: 200 });
  }
  return NextResponse.json({ status: "ok", kit: result.kit, record: result.record });
}

// POST { articleId, action: "search" | "metrics", ... } — saves ONLY what the
// operator typed. An unfilled number stays null ("미입력"), never 0.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const articleId = String(body?.articleId || "");
  const action = body?.action;
  if (!articleId) return NextResponse.json({ status: "error", errorCode: "ARTICLE_ID_REQUIRED" }, { status: 400 });

  const articles = readJson("articles.json").articles || [];
  if (!articles.some((a) => a.id === articleId)) {
    return NextResponse.json({ status: "error", errorCode: "ARTICLE_NOT_FOUND" }, { status: 404 });
  }

  const data = readTraffic();
  const record = withPostingDefaults(recordFor(data, articleId)) || emptyRecord(articleId);

  if (action === "search") {
    record.search = normalizeSearchCheck(body.search || {});
  } else if (action === "posted") {
    const variantId = String(body.variantId || "");
    if (!VARIANTS.some((v) => v.id === variantId)) {
      return NextResponse.json({ status: "error", errorCode: "UNKNOWN_VARIANT" }, { status: 400 });
    }
    const { ok, error, state } = normalizePostState(body.state || {});
    if (!ok) return NextResponse.json({ status: "rejected", errorCode: "INVALID_PIN_URL", errors: [error] }, { status: 400 });
    record.posted[variantId] = state;
    // 취소해도 기록은 남는다.
    record.postLog.push({
      variantId,
      action: state ? "posted" : "canceled",
      at: new Date().toISOString(),
      pinUrl: state?.pinUrl || "",
      postedAt: state?.postedAt || "",
    });
  } else if (action === "metrics") {
    const period = body.period === "day30" ? "day30" : "day7";
    const { ok, errors, metrics } = normalizeMetrics(body.metrics || {});
    if (!ok) return NextResponse.json({ status: "rejected", errorCode: "INVALID_METRICS", errors }, { status: 400 });
    record.metrics[period] = metrics;
  } else {
    return NextResponse.json({ status: "error", errorCode: "UNKNOWN_ACTION" }, { status: 400 });
  }

  record.updatedAt = new Date().toISOString();
  // withPostingDefaults()는 사본을 돌려주므로 목록에 다시 넣어야 파일에 남는다.
  data.records = upsertRecord(data.records, record);
  writeJson(FILE, data);

  // 저장했다고 말하기 전에 파일에서 되읽어 확인한다 — 쓰기가 반영되지 않았는데
  // 화면에 "저장했습니다"가 뜨는 일이 없어야 한다.
  const saved = recordFor(readTraffic(), articleId);
  if (!saved) {
    return NextResponse.json({ status: "error", errorCode: "SAVE_NOT_PERSISTED" }, { status: 500 });
  }
  return NextResponse.json({ status: "ok", record: withPostingDefaults(saved) });
}
