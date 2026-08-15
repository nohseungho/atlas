// Guards the defect where a CHATGPT_HANDOFF article showed an empty "English
// MASTER" box in the Editor: the screen read bodyMarkdown only, but the package
// import stores the assembled articleHtml in bodyHtml. Saving that empty box
// then blanked bodyHtml too, because the articles PATCH re-derives bodyHtml
// from bodyMarkdown.
//
// Runs against the REAL data/atlas/articles.json (read-only) plus synthetic
// cases, so a future import that stops filling the canonical field fails here.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { masterBodyField, readMasterBody, masterBodyPatch } from "./master-body.js";

const DATA = path.join(process.cwd(), "data", "atlas");
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf-8"));
const articles = read("articles.json").articles || [];
const jobs = read("production-jobs.json").jobs || [];

const handoff = { bodyMarkdown: "", bodyHtml: "<h2>Quick Answer</h2><p>Yes.</p>" };
const markdown = { bodyMarkdown: "## Quick Answer\n\nYes.", bodyHtml: "<h2>Quick Answer</h2>" };

test("handoff article: the body is read from bodyHtml, not the empty bodyMarkdown", () => {
  assert.equal(masterBodyField(handoff), "bodyHtml");
  assert.equal(readMasterBody(handoff), handoff.bodyHtml);
});

test("markdown article: bodyMarkdown still wins, matching the publish pipeline", () => {
  assert.equal(masterBodyField(markdown), "bodyMarkdown");
  assert.equal(readMasterBody(markdown), markdown.bodyMarkdown);
});

test("a new article defaults to markdown authoring", () => {
  assert.equal(masterBodyField({}), "bodyMarkdown");
  assert.equal(readMasterBody({}), "");
  assert.equal(readMasterBody(null), "");
});

test("saving a handoff article writes bodyHtml — never an empty bodyMarkdown", () => {
  const patch = masterBodyPatch(handoff, handoff.bodyHtml);
  assert.deepEqual(patch, { bodyHtml: handoff.bodyHtml });
  assert.equal("bodyMarkdown" in patch, false, "an empty bodyMarkdown would blank bodyHtml on the server");
});

test("saving a markdown article keeps writing bodyMarkdown", () => {
  assert.deepEqual(masterBodyPatch(markdown, "## Changed"), { bodyMarkdown: "## Changed" });
});

test("read → save round-trips a handoff body unchanged", () => {
  const shown = readMasterBody(handoff);
  assert.deepEqual(masterBodyPatch(handoff, shown), { bodyHtml: handoff.bodyHtml });
});

// The live regression: every article a handoff job produced must have a
// non-empty canonical body, so the Editor can never open on a blank box again.
test("every CHATGPT_HANDOFF article on disk has a readable canonical MASTER", () => {
  const handoffArticleIds = jobs
    .filter((j) => j.mode === "CHATGPT_HANDOFF" && j.articleId)
    .map((j) => j.articleId);
  assert.ok(handoffArticleIds.length > 0, "fixture must contain at least one handoff article");

  for (const id of handoffArticleIds) {
    const article = articles.find((a) => a.id === id);
    assert.ok(article, `${id} is referenced by a job but missing from articles.json`);
    const body = readMasterBody(article);
    assert.ok(body.trim().length > 0, `${id} has no readable MASTER body`);
    assert.match(body, /<h2/i, `${id} body carries no section headings`);
  }
});

test("pjob_012 (Annual Multi-Trip) keeps its full body, table, FAQ and 5 images", () => {
  const job = jobs.find((j) => j.id === "pjob_012");
  assert.ok(job, "pjob_012 must exist");
  const article = articles.find((a) => a.id === job.articleId);
  assert.ok(article, "pjob_012 must point at a stored article");

  const body = readMasterBody(article);
  assert.equal(masterBodyField(article), "bodyHtml", "a handoff article is bodyHtml-canonical");
  assert.ok(body.length > 5000, `body is only ${body.length} chars`);
  assert.equal((body.match(/<img/gi) || []).length, 5, "all 5 images must survive in the body");
  assert.ok(/<table/i.test(body), "the comparison table must survive");
  assert.equal((article.faq || []).length, 5, "FAQ must be exactly 5");
  assert.ok(/Sources/i.test(body), "the Sources section must survive");
  // The MASTER leaves an empty Related skeleton and ATLAS appends the filled
  // block; only the filled one may reach the finished post.
  assert.equal((body.match(/Related ATLAS Guides/gi) || []).length, 1, "Related ATLAS Guides must appear exactly once");
  assert.equal((body.match(/class="atlas-related"/g) || []).length, 1, "the generated block must be the one that survives");
  // Every image must point at a real uploaded URL, not a placeholder or data URL.
  for (const src of body.match(/<img[^>]+src="([^"]+)"/gi) || []) {
    assert.ok(/https:\/\//.test(src), `image is not a public URL: ${src.slice(0, 60)}`);
    assert.ok(!/data:/.test(src), "base64 transport must not leak into the stored body");
  }
});
