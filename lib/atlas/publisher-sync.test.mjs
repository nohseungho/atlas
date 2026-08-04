import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalUrl,
  matchLivePost,
  reconcileArticles,
  computeCounts,
  applyRowUpdates,
  publishStateOf,
  PUBLISH_STATE,
} from "./publisher-sync.js";

const BLOG = "3095933984698455887";

function post(id, title, url, extra = {}) {
  return { id, title, url, status: "LIVE", content: "", published: "", updated: "", ...extra };
}

test("canonicalUrl: case/query/hash/trailing slash normalized, path preserved", () => {
  assert.equal(
    canonicalUrl("https://ATLAS-money-2026.blogspot.com/2026/07/foo.html?utm=1#x"),
    "https://atlas-money-2026.blogspot.com/2026/07/foo.html"
  );
  assert.equal(canonicalUrl("https://a.com/p/"), "https://a.com/p");
  assert.equal(canonicalUrl("not a url"), "");
  // Different paths must NOT collapse together.
  assert.notEqual(canonicalUrl("https://a.com/one.html"), canonicalUrl("https://a.com/two.html"));
});

test("matchLivePost: exact bloggerPostId wins over everything else", () => {
  const posts = [post("111", "Other Title", "https://b.com/other.html"), post("222", "Real", "https://b.com/real.html")];
  const r = matchLivePost({ id: "art_x", bloggerPostId: "222", title: "Other Title" }, posts);
  assert.equal(r.status, "matched");
  assert.equal(r.by, "postId");
  assert.equal(r.post.id, "222");
});

test("matchLivePost: canonical URL match when postId is absent", () => {
  const posts = [post("111", "Different Title", "https://b.com/2026/07/a.html")];
  const r = matchLivePost({ id: "art_x", publishedUrl: "https://B.com/2026/07/a.html?utm=1" }, posts);
  assert.equal(r.status, "matched");
  assert.equal(r.by, "url");
  assert.equal(r.post.id, "111");
});

test("matchLivePost: exact normalized title match when unique", () => {
  const posts = [post("111", "Food and Water Safety Abroad", "https://b.com/f.html"), post("222", "Other", "https://b.com/o.html")];
  const r = matchLivePost({ id: "art_006", title: "  food and water   safety abroad " }, posts);
  assert.equal(r.status, "matched");
  assert.equal(r.by, "title");
  assert.equal(r.post.id, "111");
});

test("matchLivePost: 2+ same-title LIVE posts => conflict, never auto-linked", () => {
  const posts = [post("111", "Same Title", "https://b.com/a.html"), post("222", "Same Title", "https://b.com/b.html")];
  const r = matchLivePost({ id: "art_x", title: "Same Title" }, posts);
  assert.equal(r.status, "conflict");
  assert.deepEqual(r.candidates.map((c) => c.id), ["111", "222"]);
});

test("matchLivePost: partial title is not a match", () => {
  const posts = [post("111", "Travel Insurance for International Trips: What to Compare First", "https://b.com/a.html")];
  const r = matchLivePost({ id: "art_x", title: "Travel Insurance" }, posts);
  assert.equal(r.status, "unmatched");
});

test("reconcile: links art_004 / art_009 by exact title and leaves art_010 pending", () => {
  const articles = [
    { id: "art_004", title: "What to Do If You Get Sick While Traveling Abroad", status: "written" },
    { id: "art_009", title: "Cruise Travel Insurance: How to Compare Medical Evacuation Coverage", status: "written" },
    { id: "art_010", title: "Emergency Medical Evacuation Insurance for Remote Travel: What to Check", status: "written" },
  ];
  const livePosts = [
    post("400", "What to Do If You Get Sick While Traveling Abroad", "https://b.com/sick.html", { published: "2026-07-20T00:00:00Z" }),
    post("900", "Cruise Travel Insurance: How to Compare Medical Evacuation Coverage", "https://b.com/cruise.html"),
    post("999", "Site Verification", "https://b.com/verify.html"),
  ];

  const { rows, externalPosts, counts } = reconcileArticles({ articles, livePosts, bloggerBlogId: BLOG });

  const byId = Object.fromEntries(rows.map((r) => [r.articleId, r]));
  assert.equal(byId.art_004.linkStatus, "linked");
  assert.equal(byId.art_004.postId, "400");
  assert.equal(byId.art_004.updates.publishState, PUBLISH_STATE.PUBLISHED);
  assert.equal(byId.art_004.updates.publishedAt, "2026-07-20T00:00:00Z");
  assert.equal(byId.art_009.linkStatus, "linked");
  assert.equal(byId.art_009.postId, "900");

  // art_010 must stay unpublished — sync never publishes anything.
  assert.equal(byId.art_010.linkStatus, "unlinked");
  assert.equal(byId.art_010.updates, null);
  assert.equal(byId.art_010.missingLink, false);

  // Site Verification is reported as external, never turned into an article.
  assert.deepEqual(externalPosts.map((p) => p.id), ["999"]);
  assert.equal(counts.bloggerLive, 3);
  assert.equal(counts.atlasLinked, 2);
  assert.equal(counts.external, 1);
  assert.equal(counts.pending, 1);
  assert.equal(counts.missingLinks, 0);
});

test("reconcile: a strong postId claim is not stolen by another article's title match", () => {
  const articles = [
    { id: "art_a", title: "Shared Title", bloggerPostId: "500" },
    { id: "art_b", title: "Shared Title" },
  ];
  const livePosts = [post("500", "Shared Title", "https://b.com/a.html")];
  const { rows, counts } = reconcileArticles({ articles, livePosts });
  const byId = Object.fromEntries(rows.map((r) => [r.articleId, r]));

  assert.equal(byId.art_a.linkStatus, "linked");
  assert.equal(byId.art_a.postId, "500");
  assert.equal(byId.art_b.linkStatus, "unlinked");
  assert.equal(counts.atlasLinked, 1);
});

test("reconcile: published article with no LIVE match is reported, never demoted", () => {
  const articles = [
    { id: "art_002", title: "Gone Post", status: "published", publishedUrl: "https://b.com/gone.html", bloggerPostId: "700" },
  ];
  const { rows, counts } = reconcileArticles({ articles, livePosts: [] });

  assert.equal(rows[0].linkStatus, "unlinked");
  assert.equal(rows[0].missingLink, true);
  assert.equal(rows[0].updates, null, "no update payload => status is never rewritten");
  assert.equal(counts.missingLinks, 1);
  assert.equal(counts.pending, 0);
});

test("publishStateOf: a published article can never be inferred back to written", () => {
  assert.equal(publishStateOf({ status: "published" }), PUBLISH_STATE.PUBLISHED);
  assert.equal(publishStateOf({ status: "written", publishedUrl: "https://b.com/a.html" }), PUBLISH_STATE.PUBLISHED);
  assert.equal(publishStateOf({ status: "written", publishState: "published" }), PUBLISH_STATE.PUBLISHED);
  assert.equal(publishStateOf({ status: "written" }), PUBLISH_STATE.WRITTEN);
  assert.equal(publishStateOf({ status: "written", publishState: "approved" }), PUBLISH_STATE.APPROVED);
  assert.equal(publishStateOf({ status: "written", publishState: "bogus" }), PUBLISH_STATE.WRITTEN);
});

test("applyRowUpdates: never blanks a stored postId / URL", () => {
  const article = { id: "art_x", bloggerPostId: "123", publishedUrl: "https://b.com/a.html", publishedAt: "2026-07-01T00:00:00Z" };
  const row = {
    updates: { bloggerPostId: "", publishedUrl: "", publishedAt: "", bloggerStatus: "LIVE", publishState: "published" },
  };
  applyRowUpdates(article, row);

  assert.equal(article.bloggerPostId, "123");
  assert.equal(article.publishedUrl, "https://b.com/a.html");
  assert.equal(article.publishedAt, "2026-07-01T00:00:00Z");
  assert.equal(article.bloggerStatus, "LIVE");
  assert.equal(article.publishState, "published");
});

test("applyRowUpdates: no updates payload => article untouched (sync failure safety)", () => {
  const article = { id: "art_x", status: "published", publishState: "published" };
  const before = JSON.stringify(article);
  assert.equal(applyRowUpdates(article, { updates: null }), false);
  assert.equal(JSON.stringify(article), before);
});

test("computeCounts: conflict rows count as missing links, not as pending", () => {
  const rows = [
    { linkStatus: "linked", missingLink: false },
    { linkStatus: "conflict", missingLink: true },
    { linkStatus: "unlinked", missingLink: false },
  ];
  const c = computeCounts({ rows, livePostCount: 5, externalCount: 2 });
  assert.equal(c.atlasLinked, 1);
  assert.equal(c.pending, 1);
  assert.equal(c.missingLinks, 1);
  assert.equal(c.conflicts, 1);
  assert.equal(c.bloggerLive, 5);
  assert.equal(c.external, 2);
});
