// Pagination contract for posts.list. A partial LIVE list is dangerous: the
// Publisher would believe an already-public post is missing and offer to create
// a duplicate. These tests stub global fetch — no network, no Blogger call.
import test from "node:test";
import assert from "node:assert/strict";
import { bloggerProvider } from "./blogger-provider.js";

function stubFetch(pages) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const token = new URL(String(url)).searchParams.get("pageToken") || "";
    const page = pages[token];
    if (!page) throw new Error(`unexpected pageToken: ${token}`);
    return { ok: true, status: 200, json: async () => page };
  };
  return calls;
}

test("listLivePosts: drains nextPageToken to the end", async () => {
  const calls = stubFetch({
    "": {
      items: [
        { id: "1", title: "A", url: "https://b.com/a.html" },
        { id: "2", title: "B", url: "https://b.com/b.html" },
      ],
      nextPageToken: "p2",
    },
    p2: {
      items: [{ id: "3", title: "C", url: "https://b.com/c.html" }],
      nextPageToken: "p3",
    },
    p3: { items: [{ id: "4", title: "D", url: "https://b.com/d.html" }] },
  });

  const posts = await bloggerProvider.listLivePosts("blog123", "token");

  assert.equal(calls.length, 3);
  assert.deepEqual(posts.map((p) => p.id), ["1", "2", "3", "4"]);
  assert.equal(posts[0].status, "LIVE");
  assert.match(calls[0].url, /status=LIVE/);
  assert.match(calls[0].url, /fetchBodies=true/);
  assert.match(calls[1].url, /pageToken=p2/);
});

test("listLivePosts: single page (no nextPageToken) makes exactly one call", async () => {
  const calls = stubFetch({ "": { items: [{ id: "1", title: "A", url: "https://b.com/a.html" }] } });
  const posts = await bloggerProvider.listLivePosts("blog123", "token");
  assert.equal(calls.length, 1);
  assert.equal(posts.length, 1);
});

test("listLivePosts: empty blog returns an empty list, not an error", async () => {
  stubFetch({ "": {} });
  assert.deepEqual(await bloggerProvider.listLivePosts("blog123", "token"), []);
});

test("listDrafts: paginates too, with view=ADMIN and no bodies", async () => {
  const calls = stubFetch({
    "": { items: [{ id: "d1", title: "Draft 1", url: "" }], nextPageToken: "p2" },
    p2: { items: [{ id: "d2", title: "Draft 2", url: "" }] },
  });

  const drafts = await bloggerProvider.listDrafts("blog123", "token");

  assert.deepEqual(drafts.map((d) => d.id), ["d1", "d2"]);
  assert.match(calls[0].url, /status=DRAFT/);
  assert.match(calls[0].url, /view=ADMIN/);
  assert.match(calls[0].url, /fetchBodies=false/);
});

test("listLivePosts: 401 mid-pagination surfaces TOKEN_EXPIRED (never a partial list)", async () => {
  globalThis.fetch = async (url) => {
    const token = new URL(String(url)).searchParams.get("pageToken") || "";
    if (!token) {
      return { ok: true, status: 200, json: async () => ({ items: [{ id: "1", title: "A", url: "" }], nextPageToken: "p2" }) };
    }
    return { ok: false, status: 401, json: async () => ({ error: { message: "unauthorized" } }) };
  };

  await assert.rejects(
    () => bloggerProvider.listLivePosts("blog123", "token"),
    (err) => err.code === "TOKEN_EXPIRED"
  );
});
