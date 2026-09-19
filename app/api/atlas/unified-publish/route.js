import { readUnified, mutateUnified } from "@/lib/atlas/unified-store";
import { SOURCES, collectChannel, assertIdentity, shortsMaterial } from "@/lib/atlas/unified-products";
import { applyCollected, prepareMaterial, reconcileChannel } from "@/lib/atlas/unified-workflow";
import { readPublicSource, xmlValue } from "@/lib/atlas/unified-evidence";
import { createBloggerSession } from "@/lib/atlas/blogger-sync";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";
import { readJson } from "@/lib/data-store";
import { evaluateUnifiedDraft } from "@/lib/atlas/policy-validator";
import { summarizePolicies } from "@/lib/atlas/operating-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publishedRecords() {
  const articles = readJson("articles.json").articles || [];
  const jobs = readJson("publishing.json").jobs || [];
  const publishedIds = new Set(jobs.filter((j) => j.publishedUrl || j.status === "succeeded").map((j) => j.articleId));
  const records = [...articles.filter((a) => a.publishedUrl || a.status === "published" || publishedIds.has(a.id)),
    ...(readJson("korea-drafts.json").items || []).filter((a) => a.publishedUrl || a.state === "published"),
    ...(readJson("publisher-state.json").externalPosts || [])];
  return records.flatMap((record) => [record, ...(record.products || []), ...(record.recommendedProducts || []), ...(record.affiliatePlan?.products || [])]);
}
function clientState(state) {
  const view = structuredClone(state);
  applyCollected(view, Object.fromEntries(Object.entries(view.channels).map(([channel, value]) => [channel, { ...value, candidates: value.candidates || value.slots.filter(Boolean) }])), publishedRecords());
  for (const channel of Object.values(view.channels)) {
    delete channel.candidates;
    channel.slots.forEach((p) => { if (p) delete p.selection; });
  }
  // Operating-policy view (never persisted): each prepared draft carries its
  // PASS/FAIL results, and each channel lists the rules that gate it.
  for (const draft of Object.values(view.drafts || {})) {
    try { draft.policy = evaluateUnifiedDraft(draft); }
    catch (e) { draft.policy = { ok: false, errorCode: "POLICY_EVALUATION_FAILED", results: [], blocking: [], warnings: [], error: String(e?.message || e) }; }
  }
  view.policies = Object.fromEntries(Object.keys(view.channels).map((channel) => [channel, summarizePolicies(channel)]));
  return view;
}
export async function GET() {
  try { return Response.json(clientState(readUnified())); }
  catch { return Response.json({ error: "저장된 자료를 읽지 못했습니다." }, { status: 500 }); }
}
async function publicPosts(channel) {
  if (channel === "global_blogger") {
    const session = createBloggerSession();
    if (!session) throw new Error("Blogger connection required");
    return session.run((token) => bloggerProvider.listLivePosts(session.bloggerBlogId, token));
  }
  const xml = await readPublicSource("https://rss.blog.naver.com/who-ami.xml", "rss.blog.naver.com");
  if (!/<rss\b/i.test(xml)) throw new Error("Invalid Naver feed");
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, entry]) => ({
    id: xmlValue(entry, "guid"), url: xmlValue(entry, "link").replace(/^http:/, "https:"), title: xmlValue(entry, "title"),
    content: xmlValue(entry, "description"), published: xmlValue(entry, "pubDate"),
  }));
}
export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Origin rejected" }, { status: 403 });
  try {
    const body = await request.json();
    // Preparation-only release: no route through this handler can invoke a publisher.
    if (body.action === "publish") return Response.json({ error: "현재 화면에서는 자료만 준비합니다. 실제 발행은 비활성화되어 있습니다." }, { status: 403 });
    if (body.action === "preparePair") {
      const entries = await Promise.all(Object.keys(SOURCES).map(async (channel) => [channel, await collectChannel(channel)]));
      await mutateUnified((state) => {
        applyCollected(state, Object.fromEntries(entries), publishedRecords());
        const koreaSlots = state.channels.korea_naver?.slots?.filter(Boolean) || [];
        const product = koreaSlots.find((p) => /(?:^|\[|\s)쿠팡(?:\]|\s|$)/i.test(String(p.evidence || "")));
        state.recovery ||= {};
        if (product) {
          prepareMaterial(state, product.id, "blog", publishedRecords());
          state.recovery.korea_naver = { checkedAt: new Date().toISOString(), message: "쿠팡 수익화 가능 후보를 우선 준비했습니다." };
        } else {
          state.recovery.korea_naver = { checkedAt: new Date().toISOString(), message: "오늘 TOP5에는 확인된 쿠팡 후보가 없습니다. 제휴 수익화가 확인되지 않은 상품은 자동 초안으로 만들지 않았습니다." };
        }
        // Global Blogger stays editorial-first. Its next information article is
        // reviewed in Publisher; do not auto-create a random DealNews product post here.
      });
    } else if (body.action === "refresh") {
      const entries = await Promise.all(Object.keys(SOURCES).map(async (channel) => [channel, await collectChannel(channel)]));
      await mutateUnified((state) => applyCollected(state, Object.fromEntries(entries), publishedRecords()));
    } else if (body.action === "prepareBlog" || body.action === "prepareShorts") {
      await mutateUnified((state) => prepareMaterial(state, String(body.id), body.action === "prepareBlog" ? "blog" : "shorts", publishedRecords()));
    } else if (body.action === "save") {
      await mutateUnified((state) => {
        const draft = state.drafts[body.id];
        if (!draft?.prepared?.blog || !["draft", "approved"].includes(draft.state)) throw new Error("수정 가능한 초안이 아닙니다.");
        assertIdentity(draft);
        for (const key of ["title", "bodyText", "disclosure", "productUrl"]) {
          if (typeof body[key] !== "string" || !body[key].trim() || body[key].length > 30000) throw new Error("입력 내용을 확인하세요.");
          draft[key] = body[key];
        }
        const url = new URL(draft.productUrl);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("상품 링크를 확인하세요.");
        draft.state = "draft"; draft.approvedHash = "";
        if (draft.prepared.shorts) draft.shorts = shortsMaterial(draft);
      });
    } else if (body.action === "reconcile") {
      const channels = body.channel ? [body.channel] : Object.keys(SOURCES);
      if (channels.some((c) => !SOURCES[c])) throw new Error("채널을 확인하세요.");
      const outcomes = await Promise.allSettled(channels.map(publicPosts));
      await mutateUnified((state) => {
        outcomes.forEach((outcome, i) => reconcileChannel(state, channels[i], outcome.status === "fulfilled" ? outcome.value : [], { error: outcome.status === "rejected" ? "unavailable" : "" }));
        applyCollected(state, state.channels, publishedRecords());
      });
    } else throw new Error("지원하지 않는 작업입니다.");
    return Response.json(clientState(readUnified()));
  } catch { return Response.json({ error: "작업을 완료하지 못했습니다. 상품 근거와 저장된 자료를 확인한 뒤 다시 시도해 주세요." }, { status: 409 }); }
}
