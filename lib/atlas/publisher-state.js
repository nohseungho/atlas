// Server-side source of truth for the Publisher screen.
//
// Everything the Publisher shows (publish state, approval, Blogger postId/URL,
// publish time, last sync) lives in data/atlas/*.json and is read back from the
// server on every load. The browser's localStorage is a UI convenience cache
// only — it is never consulted to decide whether something is published.
//
// No new DB: this reuses the existing data/atlas JSON store and its atomic
// writeJson (temp file + rename).
import fs from "fs";
import path from "path";
import { readJson, writeJson } from "@/lib/data-store";
import {
  PUBLISH_STATE,
  publishStateOf,
  computeCounts,
  reconcileArticles,
  applyRowUpdates,
} from "@/lib/atlas/publisher-sync";

const FILE = "publisher-state.json";

const EMPTY_STATE = {
  blogId: "blog_001",
  lastSyncedAt: "",
  lastSyncStatus: "",
  lastSyncMessage: "",
  connection: "unknown",
  bloggerLiveCount: 0,
  externalPosts: [],
  counts: null,
};

function ensureFile() {
  const filePath = path.join(process.cwd(), "data", "atlas", FILE);
  if (!fs.existsSync(filePath)) writeJson(FILE, EMPTY_STATE);
}

export function getPublisherState() {
  ensureFile();
  return { ...EMPTY_STATE, ...readJson(FILE) };
}

export function savePublisherState(patch) {
  const next = { ...getPublisherState(), ...patch };
  writeJson(FILE, next);
  return next;
}

// Rebuilds the Publisher rows from server data ALONE (no Blogger call), using
// the last sync's LIVE snapshot for the remote-side counts. This is what makes
// the screen survive a refresh or a browser restart.
export function buildPublisherView() {
  const state = getPublisherState();
  const articles = readJson("articles.json").articles || [];

  const rows = articles.map((article) => {
    const publishState = publishStateOf(article);
    const linked = Boolean(article.bloggerPostId);
    return {
      articleId: article.id,
      title: article.title || "",
      category: article.category || "",
      publishState,
      approvedAt: article.approvedAt || "",
      linkStatus: linked ? "linked" : publishState === PUBLISH_STATE.PUBLISHED ? "unlinked" : "unlinked",
      missingLink: publishState === PUBLISH_STATE.PUBLISHED && !linked,
      bloggerStatus: article.bloggerStatus || (linked ? "LIVE" : ""),
      postId: article.bloggerPostId || "",
      url: article.publishedUrl || article.bloggerUrl || "",
      publishedAt: article.publishedAt || "",
      syncedAt: article.bloggerSyncedAt || "",
      error: article.publishError || "",
      errorCode: article.publishErrorCode || "",
      canApprove: publishState === PUBLISH_STATE.WRITTEN || publishState === PUBLISH_STATE.FAILED,
      canRevoke: publishState === PUBLISH_STATE.APPROVED,
      canPublish: publishState === PUBLISH_STATE.APPROVED,
      canUpdateExisting: publishState === PUBLISH_STATE.PUBLISHED && linked,
    };
  });

  const counts = computeCounts({
    rows: rows.map((r) => ({
      linkStatus: r.postId ? "linked" : "unlinked",
      missingLink: r.missingLink,
    })),
    livePostCount: state.bloggerLiveCount,
    externalCount: (state.externalPosts || []).length,
  });

  return { state, rows, counts };
}

// Approval gate. written/publish_failed → approved, and approved → written.
// Approval is stored server-side so a refresh cannot "forget" it and a publish
// request cannot be approved by the client alone.
export function setApproval(articleId, approve) {
  const data = readJson("articles.json");
  const article = data.articles.find((a) => a.id === articleId);
  if (!article) return { ok: false, errorCode: "ARTICLE_NOT_FOUND" };

  const current = publishStateOf(article);
  if (current === PUBLISH_STATE.PUBLISHED) return { ok: false, errorCode: "ALREADY_PUBLISHED" };
  if (current === PUBLISH_STATE.PUBLISHING) return { ok: false, errorCode: "PUBLISH_IN_PROGRESS" };

  if (approve) {
    if (current !== PUBLISH_STATE.WRITTEN && current !== PUBLISH_STATE.FAILED) {
      return { ok: false, errorCode: "INVALID_STATE", publishState: current };
    }
    article.publishState = PUBLISH_STATE.APPROVED;
    article.approvedAt = new Date().toISOString();
    article.publishError = "";
    article.publishErrorCode = "";
  } else {
    if (current !== PUBLISH_STATE.APPROVED) return { ok: false, errorCode: "INVALID_STATE", publishState: current };
    article.publishState = PUBLISH_STATE.WRITTEN;
    article.approvedAt = "";
  }

  article.updatedAt = new Date().toISOString();
  writeJson("articles.json", data);
  return { ok: true, publishState: article.publishState, approvedAt: article.approvedAt };
}

// Persists a full reconcile result. Called only after a SUCCESSFUL Blogger read —
// a failed/expired read must leave articles.json untouched.
export function applySyncResult({ blogId, livePosts, bloggerBlogId }) {
  const data = readJson("articles.json");
  const now = new Date().toISOString();
  const result = reconcileArticles({
    articles: data.articles,
    livePosts,
    bloggerBlogId,
    now,
  });

  let changed = 0;
  for (const row of result.rows) {
    const article = data.articles.find((a) => a.id === row.articleId);
    if (!article) continue;

    let touched = applyRowUpdates(article, row);

    // Persist the reconcile diagnosis on the article itself so the Publisher can
    // show the concrete cause (and keep showing it after a refresh) without
    // having to re-run a Blogger sync.
    const errorCode = row.linkStatus === "conflict" ? "SYNC_CONFLICT" : row.missingLink ? "LINK_MISSING" : "";
    if (!row.updates && (article.publishError || "") !== (row.error || "")) {
      article.publishError = row.error || "";
      article.publishErrorCode = errorCode;
      touched = true;
    }

    if (touched) {
      article.updatedAt = now;
      changed += 1;
    }
  }

  if (changed > 0) writeJson("articles.json", data);

  savePublisherState({
    blogId,
    lastSyncedAt: now,
    lastSyncStatus: result.hasConflict ? "conflict" : "ok",
    lastSyncMessage: "",
    connection: "connected",
    bloggerLiveCount: livePosts.length,
    externalPosts: result.externalPosts,
    counts: result.counts,
  });

  return { ...result, changed, syncedAt: now };
}

// Records a failed sync WITHOUT touching articles.json. An expired OAuth token or
// a Blogger outage must never downgrade a published article back to written.
export function recordSyncFailure({ blogId, status, message }) {
  return savePublisherState({
    blogId,
    lastSyncStatus: status,
    lastSyncMessage: message || "",
    connection: status === "reconnect_required" ? "reconnect_required" : "error",
  });
}
