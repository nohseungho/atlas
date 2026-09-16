import { readUnified, mutateUnified } from "@/lib/atlas/unified-store";
import { SOURCES, CHECKS, collectChannel, prepareProduct, assertReady, assertApproved, publishedUrlFor, reviewHash, renderDraft, escapeHtml, shortsMaterial } from "@/lib/atlas/unified-products";
import { runNaverBrowserJob } from "@/lib/atlas/naver-browser-publisher";
import { createBloggerSession } from "@/lib/atlas/blogger-sync";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";
import { getCharacterDefinition } from "@/lib/atlas/character-channel-policy";
import { readJson } from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json(readUnified()); }

async function publish(id) {
  const draft = await mutateUnified((state) => {
    const item = state.drafts[id];
    if (!item) throw new Error("원고를 찾을 수 없습니다.");
    assertApproved(item);
    item.state = "publishing";
    item.attemptedAt = new Date().toISOString();
    return structuredClone(item);
  });
  let result;
  try {
    if (draft.channelId === "korea_naver") {
      result = await runNaverBrowserJob({ ...draft, productName: draft.product.name, affiliateUrl: draft.productUrl, affiliateDisclosure: draft.disclosure, bodyHtml: renderDraft(draft) }, { publish: true });
    } else {
      const session = createBloggerSession();
      if (!session) throw new Error("Blogger 기존 연결을 확인하세요.");
      const live = await session.run((token) => bloggerProvider.listLivePosts(session.bloggerBlogId, token));
      if (live.some((post) => post.title.trim() === draft.title.trim() || post.content.includes(draft.product.sourceUrl.replace(/&/g, "&amp;")))) throw new Error("같은 제목 또는 상품 근거가 있는 공개 글이 존재합니다.");
      const html = `${renderDraft(draft)}${draft.images.map((img) => `<img src="${escapeHtml(img.src)}" alt="Miji">`).join("")}`;
      // Never retry a non-idempotent insert, including when its response is lost.
      await session.run((token) => bloggerProvider.validateAuth({ accessToken: token }));
      result = await bloggerProvider.publish({}, { bloggerBlogId: session.bloggerBlogId, title: draft.title, html }, { accessToken: session.tokenState.accessToken });
    }
    const url = publishedUrlFor(draft, result);
    await mutateUnified((state) => { Object.assign(state.drafts[id], { state: "published", publishedUrl: url, externalId: result.externalId || "", publishedAt: new Date().toISOString(), error: "" }); });
  } catch {
    await mutateUnified((state) => { Object.assign(state.drafts[id], { state: "needs_reconciliation", error: "발행 성공 여부 확인이 필요합니다. 중복 방지를 위해 재발행이 잠겼습니다. 채널의 실제 글 목록을 확인하세요." }); });
  }
}

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Origin rejected" }, { status: 403 });
  try {
    const body = await request.json();
    if (body.action === "refresh") {
      const entries = await Promise.all(Object.keys(SOURCES).map(async (channel) => [channel, await collectChannel(channel)]));
      await mutateUnified((state) => { state.channels = Object.fromEntries(entries); });
    } else if (body.action === "prepare") {
      await mutateUnified((state) => {
        const product = Object.values(state.channels).flatMap((c) => c.slots).find((p) => p?.id === body.id);
        if (!product) throw new Error("확인된 상품을 선택하세요.");
        const existing = state.drafts[product.id];
        if (existing && !["draft", "approved"].includes(existing.state)) throw new Error("발행 이력이 있는 상품입니다.");
        if (!existing || existing.product.checkedAt !== product.checkedAt) state.drafts[product.id] = prepareProduct(product);
      });
    } else if (body.action === "save" || body.action === "approve") {
      await mutateUnified((state) => {
        const draft = state.drafts[body.id];
        if (!draft || !["draft", "approved"].includes(draft.state)) throw new Error("수정 가능한 초안이 아닙니다.");
        if (body.action === "save") {
          for (const key of ["title", "bodyText", "disclosure", "productUrl"]) {
            if (typeof body[key] !== "string" || body[key].length > 30000) throw new Error("입력 내용을 확인하세요.");
            draft[key] = body[key];
          }
          const character = getCharacterDefinition(draft.character);
          if (draft.channelId === "korea_naver") draft.images = body.useMaster ? [{ id: "hero", role: "hero", src: character.masterAssetPath, alt: character.displayName }] : [];
          else {
            const src = String(body.imageUrl || "").trim();
            if (src && !/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[^/]+\/)*atlas\/articles\/[^?#]+$/i.test(src)) throw new Error("기존 해외 Blogger atlas/articles 이미지 URL을 사용하세요.");
            draft.images = src ? [{ id: "hero", role: "hero", src, alt: "Miji" }] : [];
          }
          draft.state = "draft"; draft.approvedHash = "";
          draft.shorts = shortsMaterial(draft);
        } else {
          assertReady(draft);
          if (!CHECKS.every((key) => body.checks?.[key] === true)) throw new Error("다섯 항목 모두 최종 점검하세요.");
          // Check known local records as well as this workflow's durable ledger.
          const file = draft.channelId === "korea_naver" ? "korea-drafts.json" : "articles.json";
          const data = readJson(file);
          if ((data.items || data.articles || []).some((p) => (p.publishedUrl || p.status === "published" || p.state === "published") && (p.title === draft.title || p.productUrl === draft.productUrl))) throw new Error("기존 공개 글과 중복됩니다.");
          draft.state = "approved"; draft.approvedHash = reviewHash(draft);
        }
      });
    } else if (body.action === "publish") await publish(String(body.id));
    else throw new Error("지원하지 않는 작업입니다.");
    return Response.json(readUnified());
  } catch (error) { return Response.json({ error: error.message }, { status: 409 }); }
}
