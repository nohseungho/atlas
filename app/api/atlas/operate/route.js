import { requestOriginAllowed } from "@/lib/atlas/request-origin";
import { readTopicResearch, refreshTopicResearch } from "@/lib/atlas/operate/topic-research";
import { createKoreaDocument, renderArticleDocument } from "@/lib/atlas/article-document";
import { assertNewPost } from "@/lib/atlas/publish-transaction";
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
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import { readJson, writeJson } from "@/lib/data-store";
import { ATLAS_CHANNEL_ID } from "@/lib/atlas/character-channel-policy";
import { normalizeKoreaDraft, validateKoreaDraft, naverEditorTarget } from "@/lib/atlas/korea-product-pipeline";
import { buildArticleFromMaster, nextArticleId, validateMasterPackage } from "@/lib/atlas/article-factory";
import { buildGlobalDocument, buildLocalPreviewHtml, markdownToHtml } from "@/lib/html-exporter";
import { evaluateGlobalArticle, evaluateKoreaDraft } from "@/lib/atlas/policy-validator";
import { globalTopics, koreaTopics, findTopic } from "@/lib/atlas/operate/topic-catalog";
import { buildKoreaInfoDraft } from "@/lib/atlas/operate/korea-info-writer";
import { koreaInfoImages, koreaProductPhotoSlot } from "@/lib/atlas/operate/korea-info-writer";
import { POST as importProductPage } from "@/app/api/atlas/product-import/route";
import { buildGlobalMasterPackage } from "@/lib/atlas/operate/global-dialogue-writer";
import {
  globalLocalImageStatus,
  koreaLocalImageStatus,
  renderGlobalArticleImages,
  renderKoreaDraftImages,
} from "@/lib/atlas/operate/image-render";
import { duplicateReason, publishedIndex } from "@/lib/atlas/operate/published-index";
import { globalRecent, globalReviewPacket, koreaRecent, koreaReviewPacket, recordUserApproval, recordFinalReview, deliveryIssues } from "@/lib/atlas/operate/publish-approval-store";
import { topicSimilarity } from "@/lib/atlas/publish-review";
import { resolveSceneArt } from "@/lib/atlas/operate/scene-art";
import { matchingPublicKoreaPosts } from "@/lib/atlas/operate/naver-public-sync";
import { collectChannel } from "@/lib/atlas/unified-products";
import { readPublicSource } from "@/lib/atlas/unified-evidence";
import { readUnified, mutateUnified } from "@/lib/atlas/unified-store";
import { applyCollected } from "@/lib/atlas/unified-workflow";
import { coupangPartnersStatus } from "@/lib/atlas/coupang-partners-status";
import { isHomeConvenienceProduct, sellerUrlForCandidate } from "@/lib/atlas/operate/merchant-link";
import { exclusionKeys, selectTopFive } from "@/lib/atlas/unified-selection";
import { connectImageEngine, imageEngineStatus } from "@/lib/atlas/operate/local-image-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KOREA_FILE = "korea-drafts.json";
const ARTICLES_FILE = "articles.json";
const execFileAsync = promisify(execFile);

async function generateMissingScenes(channel, topicId, roles) {
  const slug = String(topicId || "").replace(/^(kr|gl)_info_/, "");
  const missing = resolveSceneArt(channel, slug, roles).missing;
  if (!missing.length) return "";
  try {
    const url = process.env.ATLAS_COMFY_URL || "http://127.0.0.1:8188";
    const response = await fetch(new URL("/system_stats", url), { signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new Error(`이미지 제작 엔진 응답 ${response.status}`);
    await execFileAsync(process.execPath, [path.join(process.cwd(), "scripts", "atlas-scene-generate.mjs"), channel, slug,
      "--roles", missing.join(","), "--comfy", url], { cwd: process.cwd(), timeout: 40 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
    return "";
  } catch (error) {
    return `이미지 제작 대기: ${String(error?.message || error).slice(0, 240)}`;
  }
}

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
    publicImages: (article.visualAssets || []).length - deliveryIssues(article).length,
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
  const document = createKoreaDocument(draft);
  return { document, html: renderArticleDocument(document, { imageUrl: (block) =>
    `/api/atlas/operate/asset?draft=${encodeURIComponent(draft.id)}&image=${encodeURIComponent(block.assetId)}&ext=${encodeURIComponent(path.extname(block.src).slice(1) || "png")}` }),
    placements: document.blocks.filter((block) => block.type === "image") };
}

function globalPreview(article) {
  const document = buildGlobalDocument(article);
  return { document, html: buildLocalPreviewHtml(article), placements: document.blocks.filter((block) => block.type === "image") };
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
  const daily = readUnified().channels?.[ATLAS_CHANNEL_ID.KOREA_NAVER];
  const dailyFresh = daily && Date.now() - Date.parse(daily.checkedAt) >= 0
    && Date.now() - Date.parse(daily.checkedAt) < 24 * 60 * 60 * 1000;

  return {
    [ATLAS_CHANNEL_ID.KOREA_NAVER]: {
      research: readTopicResearch(ATLAS_CHANNEL_ID.KOREA_NAVER),
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
      today: daily ? { checkedAt: daily.checkedAt, source: daily.source?.name || "공개 할인 게시판",
        candidates: (dailyFresh ? daily.slots || [] : []).filter(Boolean).map((item) => ({
          id: item.id, name: item.name, priceText: item.priceText, sourceUrl: item.sourceUrl,
          reason: item.reason, publishedAt: item.publishedAt, sellerUrl: item.sellerUrl || "",
          sellerVerified: Boolean(item.verifiedProduct),
        })), error: daily.error || "" } : null,
    },
    [ATLAS_CHANNEL_ID.GLOBAL_BLOGGER]: {
      research: readTopicResearch(ATLAS_CHANNEL_ID.GLOBAL_BLOGGER),
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

async function generatorReadiness() {
  return imageEngineStatus();
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    return NextResponse.json({
      status: "ok",
      state: buildState({ koreaId: params.get("koreaId") || "", globalId: params.get("globalId") || "" }),
      generator: await generatorReadiness(),
      approvals: { coupang: coupangPartnersStatus().stage, adsense: "account_check_required" },
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

async function importSellerProduct(url) {
  const response = await importProductPage(new Request("http://localhost:3002/api/atlas/product-import", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
  }));
  const imported = await response.json();
  if (!response.ok) return { ok: false, error: imported.errorCode === "BLOCKED_BY_SITE"
    ? "판매처가 자동 조회를 거부했습니다. 다른 후보를 선택하세요." : imported.message || "상품 정보를 확인하지 못했습니다." };
  const product = imported.draft;
  if (!product.name || product.currentPrice === null || !product.currency || !product.features?.length) {
    return { ok: false, error: "상품명·현재가·통화·특징이 확인되지 않았습니다." };
  }
  return { ok: true, imported };
}

async function prepareKoreaProduct(url, { verifiedOffer = null } = {}) {
  const checkedAt = Date.parse(verifiedOffer?.verifiedAt || "");
  const cached = verifiedOffer?.sellerUrl === url && verifiedOffer.imported?.draft?.name
    && verifiedOffer.imported.draft.currentPrice !== null && verifiedOffer.imported.draft.features?.length
    && Number.isFinite(checkedAt)
    && Date.now() - checkedAt >= 0 && Date.now() - checkedAt < 24 * 60 * 60 * 1000;
  const result = cached ? { ok: true, imported: verifiedOffer.imported } : await importSellerProduct(url);
  if (!result.ok) return { status: "rejected", error: result.error, code: 422 };
  const imported = result.imported;
  const product = imported.draft;
  const topicId = `kr_info_product_${crypto.createHash("sha256").update(imported.canonicalUrl || url).digest("hex").slice(0, 12)}`;
  const items = koreaItems();
  if (items.some((d) => d.topicId === topicId || d.productUrl === imported.canonicalUrl)) {
    return { status: "duplicate", error: "이미 준비했거나 게시한 제품입니다. 준비된 글에서 확인하세요.", code: 409 };
  }
  const name = product.name;
  const price = `${product.currentPrice.toLocaleString("ko-KR")} ${product.currency}`;
  const features = product.features.slice(0, 5).map((feature) => String(feature).trim()).filter(Boolean);
  const topic = {
    keyword: name,
    sections: [{ heading: "필요한 상황", paragraphs: [] }, { heading: "제품 정보와 특징", paragraphs: [] }],
    sceneIntents: {
      info_why: `Suho noticing an everyday problem that ${name} is intended to solve, in a real Korean home setting`,
      info_how: `Suho naturally using ${name} in a different part of a Korean home; product shape must match the verified product photo`,
      info_checklist: `Suho checking the dimensions and purchase details of ${name} in a third distinct lived-in scene`,
    },
  };
  const bodyText = [
    `생활 속에서 ${name}을 살펴볼 때는 판매 페이지에 적힌 구성과 가격부터 확인하는 편이 정확합니다. 직접 사용한 후기가 아니라 판매처에서 확인한 정보로 정리했습니다.`,
    "필요한 상황", `${name}을 둘 자리를 먼저 살펴보세요. 제품 크기가 맞는지, 평소 쓰려는 용도에 필요한 기능이 있는지부터 보면 선택이 편해집니다.`,
    "제품 정보와 특징", `${name}의 판매 정보에서 확인한 내용을 정리했습니다. 옵션별 구성은 판매 페이지에서 다시 확인하세요.`,
    "제품 정보와 현재 가격", `${name}\n확인 가격: ${price}\n확인일: ${product.priceCheckedAt}\n판매처: ${imported.canonicalUrl}`,
    "선택할 만한 특징", ...features.map((feature) => `- ${feature}`),
    "구매 전에 아쉬운 점과 확인할 점",
    `사용감은 직접 써본 분들의 후기도 함께 살펴보면 좋습니다.${product.shippingFee === null ? " 배송비 안내는 결제 화면에서 한번 더 살펴보세요." : ` 확인된 배송비: ${product.shippingFee.toLocaleString("ko-KR")} ${product.currency}.`}`,
    "잘 맞는 사람", `위에 적힌 특징이 필요한 사람에게 비교 후보가 됩니다. 설치 공간과 옵션은 구매 전에 직접 확인하세요.`,
    "오늘의 체크리스트", `- ${name}의 현재 가격과 옵션 다시 확인\n- 설치 공간과 크기 확인\n- 배송비와 반품 조건 확인`,
    "마무리", `가격과 옵션은 바뀔 수 있습니다. ${name}의 현재 판매 정보는 원문 링크에서 다시 확인하세요.`,
  ].join("\n\n");
  const draft = normalizeKoreaDraft({
    id: `kr_${topicId}`, topicId, contentType: "new_product_review", title: `${name}, 가격과 특징·구매 전 확인할 점`,
    productName: name, productUrl: imported.canonicalUrl, productInfo: { ...product, evidence: imported.evidence },
    keyword: name, bodyText, images: [
      koreaProductPhotoSlot({ productName: name }),
      ...koreaInfoImages(topic),
    ],
    productImageCandidates: imported.imageCandidates, state: "ready_for_review", generatedBy: "ATLAS_VERIFIED_PRODUCT_IMPORT",
  });
  const validation = validateKoreaDraft(draft);
  if (!validation.ok) return { status: "rejected", error: validation.issues.join(", "), code: 422 };
  writeKoreaItems([draft, ...items]);
  return { status: "ok", id: draft.id, topicId };
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

async function regenerateKoreaImage(id, role) {
  const items = koreaItems();
  const draft = items.find((item) => item.id === id && item.topicId && item.state !== "published" && !item.publishedUrl && !item.naverUrl && !item.logNo);
  if (!draft || !["info_why", "info_how", "info_checklist"].includes(role) || !(draft.images || []).some((img) => img.role === role)) {
    return { status: "error", error: "다시 만들 수 있는 국내 장면을 찾지 못했습니다.", code: 400 };
  }
  const topic = findTopic(draft.topicId);
  const latestPrompt = topic?.sceneIntents ? koreaInfoImages(topic).find((img) => img.role === role)?.prompt : "";
  const revised = { ...draft, images: draft.images.map((img) => img.role === role && latestPrompt ? { ...img, prompt: latestPrompt } : img) };
  writeKoreaItems(items.map((item) => item.id === id ? revised : item));
  try {
    const slug = String(draft.topicId).replace(/^kr_info_/, "");
    const url = process.env.ATLAS_COMFY_URL || "http://127.0.0.1:8188";
    await execFileAsync(process.execPath, [path.join(process.cwd(), "scripts", "atlas-scene-generate.mjs"), "korea", slug,
      "--roles", role, "--seed-base", String(Date.now() % 1_000_000_000), "--comfy", url],
    { cwd: process.cwd(), timeout: 40 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
    return { ...(await imagesKorea(true, id)), id };
  } catch (error) {
    writeKoreaItems(koreaItems().map((item) => item.id === id ? draft : item));
    return { status: "error", error: `장면 재제작 실패: ${String(error?.message || error).slice(0, 500)}`, code: 500 };
  }
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
  if (!requestOriginAllowed(request)) return NextResponse.json({ error: "Origin rejected" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  if (action === "connectImageEngine") {
    try { return NextResponse.json({ status: "ok", generator: await connectImageEngine() }); }
    catch (error) { return NextResponse.json({ status: "error", error: String(error?.message || error) }, { status: 500 }); }
  }
  const channelId = String(body.channelId || "");
  const korea = channelId === ATLAS_CHANNEL_ID.KOREA_NAVER;
  const global = channelId === ATLAS_CHANNEL_ID.GLOBAL_BLOGGER;
  if (!korea && !global) {
    return NextResponse.json({ status: "error", error: "channelId를 확인하세요." }, { status: 400 });
  }

  try {
    let result;
    if (action === "refreshToday") {
      const [rss, offers] = await Promise.allSettled([
        readPublicSource("https://rss.blog.naver.com/who-ami.xml", "rss.blog.naver.com"),
        collectChannel(channelId),
      ]);
      let synchronized = 0;
      if (korea && rss.status === "fulfilled" && /<rss\b/i.test(rss.value)) {
        const items = koreaItems();
        const matches = matchingPublicKoreaPosts(rss.value, items);
        for (const post of matches) {
          const draft = items.find((item) => item.id === post.id);
          draft.state = "published";
          draft.publishedUrl = post.url;
          draft.publishedAt = post.publishedAt;
          synchronized += 1;
        }
        if (synchronized) writeKoreaItems(items);
      }
      if (korea && offers.status === "fulfilled") {
        const published = publishedIndex();
        offers.value.candidates = offers.value.candidates.filter(isHomeConvenienceProduct);
        offers.value.slots = selectTopFive(offers.value.candidates,
          exclusionKeys(published[ATLAS_CHANNEL_ID.KOREA_NAVER]));
        const eligible = (offers.value.slots || []).filter(Boolean);
        const sellerUrls = await Promise.all(eligible.map(sellerUrlForCandidate));
        const offersById = new Map(await Promise.all(eligible.map(async (item, index) => {
          const sellerUrl = sellerUrls[index];
          if (!sellerUrl) return [item.id, { sellerUrl: "", verifiedProduct: null }];
          const result = await importSellerProduct(sellerUrl);
          return [item.id, { sellerUrl, verifiedProduct: result.ok
            ? { sellerUrl, verifiedAt: new Date().toISOString(), imported: result.imported } : null }];
        })));
        offers.value.candidates = offers.value.candidates.map((item) => ({
          ...item, ...offersById.get(item.id),
        }));
        await mutateUnified((unified) => applyCollected(unified,
          { [ATLAS_CHANNEL_ID.KOREA_NAVER]: offers.value }, published[ATLAS_CHANNEL_ID.KOREA_NAVER]));
      }
      const researchProducts = korea
        ? (readUnified().channels?.[ATLAS_CHANNEL_ID.KOREA_NAVER]?.slots || []).filter(Boolean)
        : (offers.status === "fulfilled" ? offers.value.candidates : []) || [];
      const research = await refreshTopicResearch(channelId, korea ? koreaTopics() : globalTopics(), researchProducts);
      result = { status: "ok", research, synchronized, feedAvailable: rss.status === "fulfilled",
        offerAvailable: offers.status === "fulfilled" && !offers.value.error };
    } else if (action === "saveReview") {
      const data = readJson(korea ? KOREA_FILE : ARTICLES_FILE);
      const record = (korea ? data.items : data.articles).find((item) => item.id === String(body.id || ""));
      if (!record) return NextResponse.json({ error: "수정할 초안을 찾지 못했습니다." }, { status: 404 });
      assertNewPost(record);
      if (!String(body.title || "").trim() || !String(body.text || "").trim()) return NextResponse.json({ error: "제목과 본문을 입력하세요." }, { status: 400 });
      record.title = String(body.title).trim();
      if (korea) record.bodyText = String(body.text);
      else {
        record.masterMarkdown = String(body.text);
        record.masterHtml = markdownToHtml(record.masterMarkdown);
        record.masterApproved = true;
      }
      record.updatedAt = new Date().toISOString();
      writeJson(korea ? KOREA_FILE : ARTICLES_FILE, data);
      result = { status: "ok", id: record.id };
    } else if (action === "dryRun") {
      const record = (korea ? koreaItems() : articleList()).find((item) => item.id === String(body.id || ""));
      if (!record) return NextResponse.json({ error: "검증할 초안을 찾지 못했습니다." }, { status: 404 });
      const review = korea ? koreaReviewPacket(record) : globalReviewPacket(record);
      if (global) review.blocking.push(...deliveryIssues(record));
      // No approval writes, worker launch, uploads, or external post calls.
      result = { status: "ok", id: record.id, dryRun: true, ready: review.blocking.length === 0,
        review, document: review.document, imageAnchors: review.document.blocks.filter((block) => block.type === "image").map(({ assetId, anchorAfter }) => ({ assetId, anchorAfter })) };
    } else if (action === "prepare") {
      // 한 번의 제작 요청에서 기존 작성기와 장면 아트 연결기를 순서대로 사용한다.
      // 이미지가 아직 없으면 요청서만 남고 발행 승인은 열리지 않는다.
      const written = korea ? writeKorea(String(body.topicId || "")) : writeGlobal(String(body.topicId || ""));
      if (written.status === "ok") {
        const topicId = String(body.topicId || "");
        const record = korea ? koreaItems().find((d) => d.id === written.id) : articleList().find((a) => a.id === written.id);
        const roles = korea ? (record.images || []).filter((img) => img.role !== "product_photo").map((img) => img.role)
          : (record.visualAssets || []).map((asset) => asset.role || asset.key);
        const generatorError = await generateMissingScenes(korea ? "korea" : "global", topicId, roles);
        result = { ...written, ...(korea ? await imagesKorea(false, written.id) : await imagesGlobal(false, written.id)),
          id: written.id, generatorError };
      } else result = written;
    } else if (action === "prepareProduct" && korea) {
      const url = String(body.productUrl || "");
      const verifiedOffer = (readUnified().channels?.[ATLAS_CHANNEL_ID.KOREA_NAVER]?.slots || [])
        .find((item) => item?.sellerUrl === url)?.verifiedProduct || null;
      const written = await prepareKoreaProduct(url, { withProductPhoto: body.withProductPhoto === true, verifiedOffer });
      if (written.status === "ok") {
        const draft = koreaItems().find((d) => d.id === written.id);
        const roles = draft.images.filter((img) => img.role !== "product_photo").map((img) => img.role);
        const generatorError = await generateMissingScenes("korea", written.topicId, roles);
        result = { ...written, ...(await imagesKorea(false, written.id)), generatorError };
      } else result = written;
    } else if (action === "write") {
      result = korea ? writeKorea(String(body.topicId || "")) : writeGlobal(String(body.topicId || ""));
    } else if (action === "images") {
      const id = String(body.id || "");
      const record = korea ? koreaItems().find((d) => d.id === id && d.topicId && d.state !== "published" && !d.publishedUrl)
        : articleList().find((a) => a.id === id && a.topicId && a.status !== "published" && !a.publishedUrl);
      if (!record) return NextResponse.json({ status: "error", error: "이미지 제작 대상 초안을 찾지 못했습니다." }, { status: 404 });
      const roles = korea ? (record.images || []).filter((img) => img.role !== "product_photo").map((img) => img.role)
        : (record.visualAssets || []).map((asset) => asset.role || asset.key);
      const generatorError = await generateMissingScenes(korea ? "korea" : "global", record.topicId, roles);
      result = { ...(korea ? await imagesKorea(Boolean(body.force), id) : await imagesGlobal(Boolean(body.force), id)), id, generatorError };
    } else if (action === "regenerateKoreaImage" && korea) {
      result = await regenerateKoreaImage(String(body.id || ""), String(body.role || ""));
    } else if (action === "recordFinalReview") {
      const reviewed = recordFinalReview({ channel: korea ? "korea" : "global", id: String(body.id || ""), code: body.reviewCode });
      result = reviewed.ok ? { status: "ok", id: body.id } : { status: "rejected", error: reviewed.issues[0], code: 409 };
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
