// Live refresh — maintenance edits to EXISTING public Blogger posts and pages.
//
// Contract:
//   - posts.patch / pages.patch only. Never posts.insert, never delete, never a
//     title, URL or publish-date change.
//   - `confirm: true` is required; without it the route returns the plan only.
//   - One target per call, identified by articleId (posts) or pageId (pages).
//   - A post is verified against the stored bloggerPostId AND publishedUrl
//     before any write (title may legitimately differ between local and live).
//   - Post HTML always passes the operating-policy validator (minus the
//     re-publish rule, since this is an update) before it is sent.
//
// Post body sources:
//   source: "assemble" — buildBloggerHtml(article): local record is the truth
//           (art_021 style, where the live post was published from this data).
//   source: "live"     — the current live HTML is kept verbatim and only the
//           requested figures are inserted (for posts whose live body was
//           rewritten by hand and must not be regenerated).
import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { buildBloggerHtml } from "@/lib/html-exporter";
import { bloggerProvider } from "@/lib/atlas/providers/blogger-provider";
import { createBloggerSession, isAuthError, RECONNECT_CODE } from "@/lib/atlas/blogger-sync";
import { evaluateGlobalArticle } from "@/lib/atlas/policy-validator";
import { insertFiguresIntoLiveHtml, insertIntoPageHtml, replaceLiveImage } from "@/lib/atlas/live-refresh";
import { resolveLocalAssetFile, uploadArticleImage } from "@/lib/atlas/providers/cloudinary-provider";
import { ATLAS_CHANNEL_ID, validateChannelIdentity } from "@/lib/atlas/character-channel-policy";
import { getPolicy, ENFORCEMENT } from "@/lib/atlas/operating-policy";

export const runtime = "nodejs";
const DEFAULT_BLOG = "blog_001";

function isLocalOrigin(request) {
  return (request.headers.get("host") || "") === "localhost:3002";
}

// Gate rules only: this is an update, so the re-publish rule does not apply,
// and render-default rules (layout container) describe assembler output, which
// a hand-written live body legitimately lacks.
function policyBlockers(article, html) {
  const r = evaluateGlobalArticle(article, { html, succeededJobCount: 0 });
  return r.blocking.filter((b) => b.code !== "ALREADY_PUBLISHED" && getPolicy(b.id)?.enforcement === ENFORCEMENT.GATE);
}

export async function POST(request) {
  if (!isLocalOrigin(request)) return NextResponse.json({ errorCode: "FORBIDDEN_ORIGIN" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const blogId = body.blogId || DEFAULT_BLOG;
  const confirm = body.confirm === true;

  const session = createBloggerSession(blogId);
  if (!session) return NextResponse.json({ status: "auth_required", errorCode: RECONNECT_CODE }, { status: 401 });

  try {
    // ── Page edit ─────────────────────────────────────────────────────────
    if (body.kind === "page") {
      const pageId = String(body.pageId || "");
      if (!pageId || !body.block) return NextResponse.json({ errorCode: "PAGE_ID_AND_BLOCK_REQUIRED" }, { status: 400 });
      const page = await session.run((at) => bloggerProvider.getPage(session.bloggerBlogId, pageId, at));
      if (!page) return NextResponse.json({ errorCode: "PAGE_NOT_FOUND" }, { status: 404 });
      const next = insertIntoPageHtml(page.content, String(body.block), { markerText: body.markerText, beforeHeading: body.beforeHeading });
      const plan = { kind: "page", pageId, title: page.title, url: page.url, applied: next.applied, reason: next.reason, beforeChars: page.content.length, afterChars: next.html.length };
      if (!confirm) return NextResponse.json({ status: "plan", ...plan });
      if (!next.applied) return NextResponse.json({ status: "noop", ...plan });
      await session.run((at) => bloggerProvider.updatePage(session.bloggerBlogId, pageId, { html: next.html }, { accessToken: at }));
      return NextResponse.json({ status: "ok", ...plan });
    }

    // ── Single-image asset correction on a live post (by postId) ──────────
    // For posts that exist only on Blogger (no local article record): swap one
    // <img> for a Miji-namespace replacement. The live body is kept byte-for-byte
    // otherwise. The replacement must pass the global character lock, and the
    // correction is recorded in data/atlas/live-asset-corrections.json.
    if (body.kind === "asset-correction") {
      const postId = String(body.postId || "");
      const matchSrc = String(body.matchSrc || "").trim();
      const replacementLocalSrc = String(body.replacementLocalSrc || "").trim();
      const newAlt = String(body.newAlt || "").trim();
      if (!postId || !matchSrc || !replacementLocalSrc || !newAlt) return NextResponse.json({ errorCode: "POST_ID_MATCH_SRC_REPLACEMENT_ALT_REQUIRED" }, { status: 400 });

      const identity = validateChannelIdentity(
        { channelId: ATLAS_CHANNEL_ID.GLOBAL_BLOGGER, character: "miji", visualAssets: [{ key: "replacement", localSrc: replacementLocalSrc, alt: newAlt }] },
        ATLAS_CHANNEL_ID.GLOBAL_BLOGGER,
      );
      if (!identity.ok) return NextResponse.json({ status: "rejected", errorCode: "ATLAS_CHANNEL_ASSET_MISMATCH", issues: identity.issues }, { status: 409 });
      const filePath = resolveLocalAssetFile(replacementLocalSrc);
      if (!filePath) return NextResponse.json({ errorCode: "REPLACEMENT_FILE_NOT_FOUND" }, { status: 400 });

      const live = await session.run((at) => bloggerProvider.getPostAdmin(session.bloggerBlogId, postId, at));
      if (!live) return NextResponse.json({ errorCode: "POST_NOT_FOUND" }, { status: 404 });
      const dry = replaceLiveImage(live.content, { matchSrc, newSrc: "https://res.cloudinary.com/dry-run/plan.png", newAlt });
      const plan = { kind: "asset-correction", postId: live.id, url: live.url, liveTitle: live.title, matchSrc, replacementLocalSrc, applied: dry.applied, reason: dry.reason, before: dry.before, imagesBefore: (live.content.match(/<img\b/gi) || []).length };
      if (!dry.applied) return NextResponse.json({ status: "noop", ...plan });
      if (!confirm) return NextResponse.json({ status: "plan", ...plan });

      const slug = String(body.slug || "").trim() || "live-asset-corrections";
      const key = String(body.key || "").trim() || `correction-${postId}`;
      const uploaded = await uploadArticleImage({ slug, key, filePath });
      const next = replaceLiveImage(live.content, { matchSrc, newSrc: uploaded.secureUrl, newAlt });
      if (!next.applied) return NextResponse.json({ status: "noop", ...plan, reason: next.reason });
      await session.run((at) => bloggerProvider.updatePost(session.bloggerBlogId, live.id, { html: next.html }, { accessToken: at }));

      const corrections = readJson("live-asset-corrections.json");
      corrections.items = Array.isArray(corrections.items) ? corrections.items : [];
      corrections.items.push({
        id: `global_${key}_${postId}`, channelId: ATLAS_CHANNEL_ID.GLOBAL_BLOGGER, platform: "blogger", articleUrl: live.url, bloggerPostId: live.id,
        assetRole: "featured", character: "miji", masterAssetPath: "public/atlas/characters/ATLAS-MIJI-MASTER.png",
        replacementAssetPath: `public${replacementLocalSrc}`, replacementPublicUrl: uploaded.secureUrl,
        before: next.before, after: next.after, status: "applied", appliedAt: new Date().toISOString(),
      });
      writeJson("live-asset-corrections.json", corrections);
      return NextResponse.json({ status: "ok", ...plan, after: next.after, publicUrl: uploaded.secureUrl, imagesAfter: (next.html.match(/<img\b/gi) || []).length });
    }

    // ── Post edit ─────────────────────────────────────────────────────────
    const articleId = String(body.articleId || "");
    const data = readJson("articles.json");
    const article = data.articles.find((a) => a.id === articleId);
    if (!article) return NextResponse.json({ errorCode: "ARTICLE_NOT_FOUND" }, { status: 404 });
    if (!article.bloggerPostId || !article.publishedUrl) return NextResponse.json({ errorCode: "NOT_A_LIVE_POST" }, { status: 409 });

    const live = await session.run((at) => bloggerProvider.getPostAdmin(session.bloggerBlogId, article.bloggerPostId, at));
    if (!live || live.url !== article.publishedUrl) {
      return NextResponse.json({ errorCode: "BLOGGER_POST_ID_NOT_VERIFIED", live: live ? { id: live.id, url: live.url } : null }, { status: 409 });
    }

    const source = body.source === "live" ? "live" : "assemble";
    const patch = {};
    const plan = { kind: "post", articleId, postId: live.id, url: live.url, liveTitle: live.title, source, changes: [] };

    if (body.html !== false) {
      if (source === "assemble") {
        patch.html = buildBloggerHtml(article);
        plan.changes.push(`html: assembled from local record (${patch.html.length} chars)`);
      } else {
        const placements = (body.insertImages || []).map((p) => ({ asset: (article.visualAssets || []).find((a) => a.key === p.key), before: p.before }));
        const ins = insertFiguresIntoLiveHtml(live.content, placements);
        plan.figures = { applied: ins.applied, skipped: ins.skipped };
        if (ins.applied.length) { patch.html = ins.html; plan.changes.push(`html: live body kept, ${ins.applied.length} figure(s) inserted`); }
      }
      if (patch.html !== undefined) {
        const blockers = policyBlockers(article, patch.html);
        if (blockers.length) return NextResponse.json({ status: "policy_rejected", errorCode: blockers[0].code, blockers, ...plan }, { status: 409 });
        plan.policy = "pass";
      }
    }
    if (Array.isArray(body.labels) && body.labels.length) { patch.labels = body.labels.map(String); plan.changes.push(`labels: ${patch.labels.join(", ")}`); }
    const meta = String(body.metaDescription || "").trim();
    if (meta) {
      if (meta.length > 160) return NextResponse.json({ errorCode: "META_DESCRIPTION_TOO_LONG", length: meta.length }, { status: 400 });
      patch.metaDescription = meta; plan.changes.push(`metaDescription: ${meta.length} chars`);
    }
    if (!plan.changes.length) return NextResponse.json({ status: "noop", ...plan });
    if (!confirm) return NextResponse.json({ status: "plan", ...plan });

    const result = await session.run((at) => bloggerProvider.updatePost(session.bloggerBlogId, live.id, patch, { accessToken: at }));

    // Persist only what describes the live post; the local body is untouched.
    const now = new Date().toISOString();
    Object.assign(article, {
      bloggerSyncedAt: now,
      updatedAt: now,
      ...(patch.labels ? { bloggerLabels: patch.labels } : {}),
      ...(patch.metaDescription ? { bloggerMetaDescription: patch.metaDescription } : {}),
      ...(patch.html !== undefined ? { liveRefreshedAt: now, liveRefreshSource: source } : {}),
    });
    writeJson("articles.json", data);
    return NextResponse.json({ status: "ok", ...plan, publishedUrl: result.publishedUrl || live.url });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ status: "auth_required", errorCode: RECONNECT_CODE, message: String(err.message || "") }, { status: 401 });
    return NextResponse.json({ status: "error", errorCode: err.code || "LIVE_REFRESH_FAILED", message: String(err.message || "").slice(0, 300) }, { status: 502 });
  }
}
