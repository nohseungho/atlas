// Live refresh helpers — figures are inserted once, at the named heading, and
// page blocks are idempotent. These guard the only two ways the maintenance
// route mutates existing public HTML.
import test from "node:test";
import assert from "node:assert/strict";
import { insertFiguresIntoLiveHtml, insertIntoPageHtml } from "./live-refresh.js";

const asset = (key) => ({ key, alt: `Alt for ${key}`, publicUrl: `https://res.cloudinary.com/demo/image/upload/v1/atlas/articles/x/${key}.webp` });
const live = `<p>Lead.</p>\n<h2>Step 1</h2><p>A.</p>\n<h2>Step 4: Compare Policy Wording, Not Marketing Labels</h2><p>B.</p>\n<h2>Frequently Asked Questions</h2><p>Q.</p>\n<h2>Sources &amp; References</h2><ul><li>x</li></ul>`;

test("figures land before the named H2 (entity/case tolerant) or at the top, each once", () => {
  const r = insertFiguresIntoLiveHtml(live, [
    { asset: asset("lead"), before: "top" },
    { asset: asset("compare"), before: "step 4: compare policy wording, not marketing labels" },
    { asset: asset("faq"), before: "Frequently Asked Questions" },
  ]);
  assert.equal(r.applied.length, 3);
  assert.ok(r.html.startsWith("<figure"), "top figure leads");
  assert.ok(r.html.indexOf("compare.webp") < r.html.indexOf("<h2>Step 4"), "compare figure precedes Step 4");
  assert.ok(r.html.indexOf("faq.webp") < r.html.indexOf("<h2>Frequently Asked"), "faq figure precedes FAQ");
  assert.ok(r.html.includes("<p>A.</p>") && r.html.includes("<li>x</li>"), "live text untouched");
  assert.equal((r.html.match(/<img/g) || []).length, 3);
  // idempotent: running again inserts nothing
  const again = insertFiguresIntoLiveHtml(r.html, [{ asset: asset("lead"), before: "top" }]);
  assert.equal(again.applied.length, 0);
  assert.equal(again.skipped[0].reason, "already in live html");
});

test("unknown heading or missing public url is skipped, never guessed", () => {
  const r = insertFiguresIntoLiveHtml(live, [
    { asset: asset("x"), before: "Nonexistent Heading" },
    { asset: { key: "y", alt: "y", publicUrl: "/images/local.png" }, before: "top" },
  ]);
  assert.equal(r.applied.length, 0);
  assert.equal(r.html, live);
  assert.deepEqual(r.skipped.map((s) => s.reason), ["heading not found: Nonexistent Heading", "no public url"]);
});

test("page block inserts before a heading when present, appends otherwise, and never duplicates", () => {
  const page = "<p>Intro.</p><h3>Cookies and Third-Party Services</h3><p>c</p><h3>External and Affiliate Links</h3><p>e</p>";
  const block = '<h3 id="ads-cookies">Advertising Cookies</h3><p>Google uses advertising cookies.</p>';
  const a = insertIntoPageHtml(page, block, { markerText: 'id="ads-cookies"', beforeHeading: "External and Affiliate Links" });
  assert.equal(a.applied, true);
  assert.ok(a.html.indexOf("Advertising Cookies") < a.html.indexOf("<h3>External"), "inserted before the heading");
  const b = insertIntoPageHtml(a.html, block, { markerText: 'id="ads-cookies"' });
  assert.equal(b.applied, false);
  assert.equal(b.html, a.html);
  const c = insertIntoPageHtml("<p>only</p>", block, { markerText: 'id="ads-cookies"', beforeHeading: "Missing" });
  assert.equal(c.reason, "appended");
  assert.ok(c.html.endsWith("</p>"));
});
