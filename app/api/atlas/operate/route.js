// ATLAS 단일 운영 API — 국내·해외 블로그를 한 화면에서
// 주제 선택 → 자동 작성 → 이미지 생성 → 미리보기 → 발행 → 공개 URL 확인 순서로 진행한다.
//
// 여기서는 실제 발행을 하지 않는다. 자동 발행은 없다(2026-09-24): 최종 검수 화면에서 사용자가
// "발행"을 눌러 approvePublish 승인이 남은 뒤에만 아래 발행 경로가 공개를 실행한다.
//   국내: POST /api/atlas/korea-publish  (운영 정책 게이트 + Edge 자동화)
//   해외: POST /api/atlas/publisher-approval → POST /api/publish (승인 게이트 + 중복 차단)
// 이 라우트는 그 앞 단계(주제·원고·이미지·미리보기)와 상태 조회만 담당한다.
import { NextResponse } from "next/server";
import fs from "fs";
import { readJson, writeJson } from "@/lib/data-store";
import { ATLAS_CHANNEL_ID } from "@/lib/atlas/character-channel-policy";
import { normalizeKoreaDraft, validateKoreaDraft, naverEditorTarget } from "@/lib/atlas/korea-product-pipeline";
import { buildArticleFromMaster, nextArticleId, validateMasterPackage } from "@/lib/atlas/article-factory";
import { buildLocalPreviewHtml, markdownToHtml } from "@/lib/html-exporter";
import { bodyHtmlFromDraft, bodyParagraphsFromDraft, planImagePlacements } from "@/lib/atlas/naver-image-placement";
import { evaluateGlobalArticle, evaluateKoreaDraft } from "@/lib/atlas/policy-validator";
import { globalTopics, koreaTopics, findTopic } from "@/lib/atlas/operate/topic-catalog";
import { buildKoreaInfoDraft } from "@/lib/atlas/operate/korea-info-writer";
import { buildGlobalMasterPackage } from "@/lib/atlas/operate/global-dialogue-writer";
import {
  globalLocalImageStatus,
  koreaLocalImageStatus,
  renderGlobalArticleImages,
  renderKoreaDraftImages,
} from "@/lib/atlas/operate/image-render";
import { duplicateReason, publishedIndex } from "@/lib/atlas/operate/published-index";
import { globalRecent, globalReviewPacket, koreaRecent, koreaReviewPacket, recordUserApproval } from "@/lib/atlas/operate/publish-approval-store";
import { topicSimilarity } from "@/lib/atlas/publish-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KOREA_FILE = "korea-drafts.json";
const ARTICLES_FILE = "articles.json";

function koreaItems() {
  return readJson(KOREA_FILE).items || [];
}

function writeKoreaItems(items) {
  writeJson(KOREA_FILE, { items });
}

function articleList() {
  return readJson(ARTICLES_FILE).articles || [];
}

// ── 단계 계산 ────────────────────────────────────────────────────────────────
// 화면의 6단계는 모두 저장된 데이터에서 파생된다. 별도의 진행 상태 필드를 두지 않으므로
// 새로고침이나 서버 재시작 뒤에도 같은 단계가 나온다.
function koreaSteps(draft) {
  if (!draft) return { step: 1, images: null };
  const images = koreaLocalImageStatus(draft);
  const written = Boolean(String(draft.bodyText || draft.bodyHtml || "").trim());
  const published = draft.state === "published" || Boolean(draft.publishedUrl);
  const imagesDone = images.total > 0 && images.ready === images.total && images.productPhotoReady === images.productPhotoTotal;
  return {
    step: published ? 6 : imagesDone ? 4 : written ? 3 : 2,
    images,
    written,
    imagesDone,
    published,
  };
}

function globalSteps(article) {
  if (!article) return { step: 1, images: null };
  const images = globalLocalImageStatus(article);
  const written = Boolean(String(article.bodyMarkdown || article.bodyHtml || "").trim());
  const published = article.status === "published" || Boolean(article.publishedUrl);
  const imagesDone = images.total > 0 && images.ready === images.total;
  return {
    step: published ? 6 : imagesDone ? 4 : written ? 3 : 2,
    images,
    written,
    imagesDone,
    published,
    publicImages: (article.visualAssets || []).filter((a) => /^https:\/\//.test(String(a.publicUrl || ""))).length,
  };
}

// 운영 화면이 다루는 작업물: 아직 공개되지 않은 운영 초안 전부(최근 수정 순).
// 기존 미발행 초안은 절대 지우지 않으며, 운영 화면이 만든 것(topicId 보유)만 대상으로 삼는다.
function byRecent(a, b) {
  return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
}

function koreaPrepared(items) {
  return items.filter((d) => d.topicId && d.state !== "published" && !d.publishedUrl).sort(byRecent);
}

function globalPrepared(articles) {
  return articles.filter((a) => a.topicId && a.status !== "published" && !a.publishedUrl).sort(byRecent);
}

// 화면이 고른 항목을 우선하고, 없으면 가장 최근 것을 쓴다.
function pick(list, id) {
  return list.find((item) => item.id === id) || list[0] || null;
}

function koreaPreview(draft) {
  const paragraphs = bodyParagraphsFromDraft(draft);
  const placements = planImagePlacements(paragraphs, draft.images || [], (src) => fs.existsSync(src));
  // 미리보기 이미지는 경로가 아니라 draft/image 식별자로 요청한다(asset 라우트 참고).
  return {
    html: bodyHtmlFromDraft(draft),
    paragraphs,
    placements: placements.map((p) => ({
      ...p,
      previewUrl: `/api/atlas/operate/asset?draft=${encodeURIComponent(draft.id)}&image=${encodeURIComponent(p.id)}`,
    })),
  };
}

function globalPreview(article) {
  return { html: buildLocalPreviewHtml(article) };
}

function buildState({ koreaId = "", globalId = "" } = {}) {
  const published = publishedIndex();
  const items = koreaItems();
  const articles = articleList();

  const koreaList = koreaPrepared(items);
  const globalList = globalPrepared(articles);
  const koreaDraft = pick(koreaList, koreaId);
  const globalArticle = pick(globalList, globalId);

  // 최근 공개 글 5개와 핵심 검색의도가 겹치는 주제는 고르지 못하게 하고 신규 주제로 유도한다.
  const koreaRecentPosts = koreaRecent("");
  const globalRecentPosts = globalRecent("");
  const koreaUsedTopics = new Set([...items.map((d) => d.topicId).filter(Boolean)]);
  const globalUsedTopics = new Set([...articles.map((a) => a.topicId).filter(Boolean)]);

  return {
    [ATLAS_CHANNEL_ID.KOREA_NAVER]: {
      channelId: ATLAS_CHANNEL_ID.KOREA_NAVER,
      character: "suho",
      topics: koreaTopics().map((topic) => ({
        id: topic.id,
        title: topic.title,
        keyword: topic.keyword,
        inSeason: topic.inSeason,
        blockedReason:
          duplicateReason({ ...topic, topicId: topic.id }, published[ATLAS_CHANNEL_ID.KOREA_NAVER])
          || (koreaUsedTopics.has(topic.id) ? "이 주제로 만든 초안이 이미 있습니다." : "")
          || topicSimilarity(topic, koreaRecentPosts).blocking[0] || "",
      })),
      draft: koreaDraft,
      prepared: koreaList.map((d) => ({ id: d.id, title: d.title, updatedAt: d.updatedAt })),
      steps: koreaSteps(koreaDraft),
      policy: koreaDraft ? evaluateKoreaDraft(koreaDraft) : null,
      preview: koreaDraft ? koreaPreview(koreaDraft) : null,
      // 최종 검수 화면: 제목·요약·이미지 전체·최근 글 5개 비교. 사용자가 "발행"을 눌러야 공개된다.
      review: koreaDraft ? koreaReviewPacket(koreaDraft) : null,
      editorTarget: koreaDraft ? naverEditorTarget(koreaDraft) : "",
      published: published[ATLAS_CHANNEL_ID.KOREA_NAVER],
    },
    [ATLAS_CHANNEL_ID.GLOBAL_BLOGGER]: {
      channelId: ATLAS_CHANNEL_ID.GLOBAL_BLOGGER,
      character: "miji",
      topics: globalTopics().map((topic) => ({
        id: topic.id,
        title: topic.title,
        keyword: topic.keyword,
        inSeason: true,
        blockedReason:
          duplicateReason({ ...topic, topicId: topic.id }, published[ATLAS_CHANNEL_ID.GLOBAL_BLOGGER])
          || (globalUsedTopics.has(topic.id) ? "이 주제로 만든 원고가 이미 있습니다." : "")
          || topicSimilarity(topic, globalRecentPosts).blocking[0] || "",
      })),
      article: globalArticle,
      prepared: globalList.map((a) => ({ id: a.id, title: a.title, updatedAt: a.updatedAt })),
      steps: globalSteps(globalArticle),
      policy: globalArticle
        ? evaluateGlobalArticle(globalArticle, { html: buildLocalPreviewHtml(globalArticle) })
        : null,
      preview: globalArticle ? globalPreview(globalArticle) : null,
      review: globalArticle ? globalReviewPacket(globalArticle) : null,
      published: published[ATLAS_CHANNEL_ID.GLOBAL_BLOGGER],
    },
  };
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    return NextResponse.json({
      status: "ok",
      state: buildState({ koreaId: params.get("koreaId") || "", globalId: params.get("globalId") || "" }),
    });
  } catch (error) {
    return NextResponse.json({ status: "error", error: String(error?.message || error) }, { status: 500 });
  }
}

// ── 자동 작성 ────────────────────────────────────────────────────────────────
function writeKorea(topicId) {
  const topic = findTopic(topicId);
  if (!topic) return { status: "error", error: "주제를 찾지 못했습니다.", code: 404 };

  const items = koreaItems();
  const published = publishedIndex()[ATLAS_CHANNEL_ID.KOREA_NAVER];
  const blocked = duplicateReason({ ...topic, topicId: topic.id }, published);
  if (blocked) return { status: "duplicate", error: blocked, code: 409 };

  const seed = buildKoreaInfoDraft(topic);
  const existing = items.find((d) => d.id === seed.id);
  // 기존 미발행 초안과 이미 연결된 이미지를 보존한다: 본문만 갱신하고 이미지 src는 유지한다.
  const draft = normalizeKoreaDraft({
    ...(existing || {}),
    ...seed,
    images: seed.images.map((slot) => {
      const previous = (existing?.images || []).find((img) => img.id === slot.id);
      return previous?.src ? { ...slot, src: previous.src } : slot;
    }),
    state: existing?.state && existing.state !== "published" ? existing.state : "ready_for_review",
  });

  const validation = validateKoreaDraft(draft);
  if (!validation.ok) return { status: "rejected", error: validation.issues.join(", "), code: 400 };

  const next = existing ? items.map((d) => (d.id === draft.id ? draft : d)) : [draft, ...items];
  writeKoreaItems(next);
  return { status: "ok", id: draft.id };
}

function writeGlobal(topicId) {
  const topic = findTopic(topicId);
  if (!topic) return { status: "error", error: "주제를 찾지 못했습니다.", code: 404 };

  const articles = articleList();
  const published = publishedIndex()[ATLAS_CHANNEL_ID.GLOBAL_BLOGGER];
  const blocked = duplicateReason({ ...topic, topicId: topic.id }, published);
  if (blocked) return { status: "duplicate", error: blocked, code: 409 };

  const existing = articles.find((a) => a.topicId === topic.id);
  if (existing && (existing.status === "published" || existing.publishedUrl)) {
    return { status: "duplicate", error: "이 주제는 이미 발행되었습니다.", code: 409 };
  }

  const master = buildGlobalMasterPackage(topic);
  // 이미 저장된 원고를 다시 쓰는 경우에는 자기 자신을 중복 검사 대상에서 뺀다.
  const others = articles.filter((a) => a.id !== existing?.id);
  const validation = validateMasterPackage(master, { articles: others, mode: "production" });
  if (!validation.ok) return { status: "rejected", error: validation.errors.join(" / "), code: 422 };

  const id = existing?.id || nextArticleId(articles);
  const now = new Date().toISOString();
  const article = {
    ...buildArticleFromMaster(master, { id, status: "written" }),
    topicId: topic.id,
    // 이미 생성된 공개 이미지 URL은 보존한다.
    visualAssets: buildArticleFromMaster(master, { id }).visualAssets.map((asset) => {
      const previous = (existing?.visualAssets || []).find((a) => a.key === asset.key);
      return previous?.publicUrl ? { ...asset, publicUrl: previous.publicUrl } : asset;
    }),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  article.bodyHtml = markdownToHtml(article.bodyMarkdown);

  const data = readJson(ARTICLES_FILE);
  data.articles = existing
    ? data.articles.map((a) => (a.id === article.id ? article : a))
    : [...data.articles, article];
  writeJson(ARTICLES_FILE, data);
  return { status: "ok", id };
}

// ── 이미지 생성 ──────────────────────────────────────────────────────────────
async function imagesKorea(force, id) {
  const items = koreaItems();
  const draft = pick(koreaPrepared(items), id);
  if (!draft) return { status: "error", error: "작성된 국내 초안이 없습니다.", code: 404 };
  const { images, rendered, missing, artRequest } = await renderKoreaDraftImages(draft, { force });
  const next = items.map((d) =>
    d.id === draft.id
      ? {
          ...d,
          images,
          automationStatus: missing.length ? "scene_art_required" : "assets_ready",
          updatedAt: new Date().toISOString(),
        }
      : d,
  );
  writeKoreaItems(next);
  // 장면 아트가 빠진 역할은 완료로 보고하지 않는다. 합성으로 자리를 메우지 않았다.
  return { status: "ok", rendered: rendered.length, missing, artRequest };
}

async function imagesGlobal(force, id) {
  const articles = articleList();
  const article = pick(globalPrepared(articles), id);
  if (!article) return { status: "error", error: "작성된 해외 원고가 없습니다.", code: 404 };
  const { rendered, missing, rejected, faceMatch, artRequest } = await renderGlobalArticleImages(article, { force });
  // 얼굴 검수 결과를 기사에 기록한다. 발행 게이트(global_character_face_match)는 이 값만 본다.
  // 기록이 없는 역할은 null로 남겨 통과로 보지 않는다.
  const data = readJson(ARTICLES_FILE);
  data.articles = data.articles.map((a) =>
    a.id === article.id
      ? {
          ...a,
          visualAssets: (a.visualAssets || []).map((v) => ({ ...v, faceMatch: faceMatch[v.role || v.key] ?? null })),
          updatedAt: new Date().toISOString(),
        }
      : a,
  );
  writeJson(ARTICLES_FILE, data);
  return { status: "ok", rendered: rendered.length, missing, rejected, artRequest };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const channelId = String(body.channelId || "");
  const korea = channelId === ATLAS_CHANNEL_ID.KOREA_NAVER;
  const global = channelId === ATLAS_CHANNEL_ID.GLOBAL_BLOGGER;
  if (!korea && !global) {
    return NextResponse.json({ status: "error", error: "channelId를 확인하세요." }, { status: 400 });
  }

  try {
    let result;
    if (action === "write") {
      result = korea ? writeKorea(String(body.topicId || "")) : writeGlobal(String(body.topicId || ""));
    } else if (action === "images") {
      result = korea
        ? await imagesKorea(Boolean(body.force), String(body.id || ""))
        : await imagesGlobal(Boolean(body.force), String(body.id || ""));
    } else if (action === "approvePublish") {
      // 최종 검수 화면의 "발행" 버튼 전용. 화면이 본 contentHash와 확인 문구가 있어야 승인이 남는다.
      // 승인만 기록하고 발행은 하지 않는다. 발행 API가 이 승인을 다시 검사한다.
      const approval = recordUserApproval({
        channel: korea ? "korea" : "global",
        id: String(body.id || ""),
        contentHash: String(body.contentHash || ""),
        confirm: String(body.confirm || ""),
      });
      result = approval.ok
        ? { status: "ok", id: String(body.id || ""), approval: approval.approval }
        : { status: "rejected", errorCode: "USER_PUBLISH_APPROVAL_REJECTED", error: approval.issues[0], issues: approval.issues, code: 409 };
    } else {
      return NextResponse.json({ status: "error", error: "지원하지 않는 작업입니다." }, { status: 400 });
    }

    const selection = {
      koreaId: korea ? String(result.id || body.id || "") : String(body.koreaId || ""),
      globalId: global ? String(result.id || body.id || "") : String(body.globalId || ""),
    };
    if (result.status !== "ok") {
      return NextResponse.json({ ...result, state: buildState(selection) }, { status: result.code || 409 });
    }
    return NextResponse.json({ ...result, state: buildState(selection) });
  } catch (error) {
    return NextResponse.json(
      { status: "failed", errorCode: error?.code || "ATLAS_OPERATE_FAILED", error: String(error?.message || error) },
      { status: 500 },
    );
  }
}
