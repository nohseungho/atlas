import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTitle, selectDraftCandidate, validateDraftHtml } from "./blogger-draft-utils.js";

test("normalizeTitle: trim, collapse ws, case, entities, smart quotes/dashes", () => {
  assert.equal(normalizeTitle("  What to   Do  "), "what to do");
  assert.equal(normalizeTitle("Travelers&#39; Diarrhea"), "travelers' diarrhea");
  assert.equal(normalizeTitle("Travelers’ Diarrhea"), "travelers' diarrhea");
  assert.equal(normalizeTitle("A &amp; B"), "a & b");
  assert.equal(normalizeTitle("Medical — Trip"), "medical - trip");
});

test("selectDraftCandidate: exactly one normalized match => found", () => {
  const drafts = [
    { id: "1", title: "What to Do If You Get Sick Traveling Abroad" },
    { id: "2", title: "Other Post" },
  ];
  const r = selectDraftCandidate(drafts, "  what to do if you get sick traveling abroad ");
  assert.equal(r.match, "found");
  assert.equal(r.post.id, "1");
});

test("selectDraftCandidate: zero matches => none", () => {
  const r = selectDraftCandidate([{ id: "2", title: "Other" }], "Nope");
  assert.equal(r.match, "none");
});

test("selectDraftCandidate: 2+ matches => multiple, never auto-pick", () => {
  const drafts = [
    { id: "a", title: "Same Title" },
    { id: "b", title: "same   title" },
  ];
  const r = selectDraftCandidate(drafts, "Same Title");
  assert.equal(r.match, "multiple");
  assert.equal(r.candidates.length, 2);
});

test("selectDraftCandidate: partial match is NOT a match", () => {
  const drafts = [{ id: "1", title: "What to Do If You Get Sick Traveling Abroad Today" }];
  const r = selectDraftCandidate(drafts, "What to Do If You Get Sick Traveling Abroad");
  assert.equal(r.match, "none");
});

test("validateDraftHtml: clean art_004-style html passes with 5 imgs", () => {
  const html = Array.from({ length: 5 })
    .map((_, i) => `<figure><img src="https://res.cloudinary.com/x/${i}.webp" alt="a" /></figure>`)
    .join("\n") + "<h2>Body</h2>";
  const r = validateDraftHtml(html);
  assert.equal(r.ok, true);
  assert.equal(r.imgCount, 5);
  assert.equal(r.cloudinaryCount, 5);
  assert.deepEqual(r.issues, []);
});

test("validateDraftHtml: rejects code fence, placeholder, data url, affiliate, dup h1", () => {
  assert.equal(validateDraftHtml("```html\n<p>x</p>").ok, false);
  assert.equal(validateDraftHtml('<img src="https://example.com/a.jpg">').ok, false);
  assert.equal(validateDraftHtml('<img src="data:image/png;base64,AAAA">').ok, false);
  assert.equal(validateDraftHtml('<a href="https://amazon.com/x">buy</a>').ok, false);
  assert.equal(validateDraftHtml("<h1>a</h1><h1>b</h1>").ok, false);
});

test("validateDraftHtml: image-less html is NOT failed by the generic gate", () => {
  const r = validateDraftHtml("<h2>Intro</h2><p>text only</p>");
  assert.equal(r.ok, true);
  assert.equal(r.imgCount, 0);
});
