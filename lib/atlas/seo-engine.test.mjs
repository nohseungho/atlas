import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCluster, slugify, uniqueSlug, validateMetaDescription, normalizeMetaDescription,
  selectLabels, selectInternalLinks, validateInternalLinks, linkableArticles,
  buildRelatedGuidesHtml, buildJsonLd, validateJsonLd, jsonLdScriptTag,
  buildSeoPackage, isAuthoritySource, hostOf, SEO_LIMITS,
} from "./seo-engine.js";

const live = (id, title, slug, keyword) => ({
  id, title, slug, keyword, status: "published",
  publishedUrl: `https://atlas-money-2026.blogspot.com/2026/07/${slug}.html`,
});

const CORPUS = [
  live("art_002", "Travel Insurance for International Trips: What to Compare First", "best-travel-insurance", "travel insurance comparison"),
  live("art_004", "What to Do If You Get Sick While Traveling Abroad", "sick-while-traveling", "medical care abroad"),
  live("art_009", "Cruise Travel Insurance: How to Compare Medical Evacuation Coverage", "cruise-travel-insurance", "cruise medical evacuation"),
  live("art_010", "Emergency Medical Evacuation Insurance for Remote Travel", "emergency-evacuation", "medical evacuation remote travel"),
  { id: "art_007", title: "Unpublished Draft", slug: "draft", status: "written", publishedUrl: "" },
];

test("clusters classify the six content areas", () => {
  assert.equal(classifyCluster("travel insurance deductible").id, "travel-insurance");
  assert.equal(classifyCluster("emergency medical evacuation").id, "medical-abroad");
  assert.equal(classifyCluster("flight cancellation refund rules").id, "flight-disruption");
  assert.equal(classifyCluster("delayed checked baggage claim").id, "baggage");
  assert.equal(classifyCluster("medicare coverage for seniors abroad").id, "senior-family");
  assert.equal(classifyCluster("embassy emergency contact safety").id, "trip-safety");
  assert.equal(classifyCluster("quantum gardening"), null);
});

test("uniqueSlug avoids the Blogger re-slug collision that produced the 404s", () => {
  assert.equal(slugify("How to Build a Travel Health Kit!"), "how-to-build-a-travel-health-kit");
  assert.equal(uniqueSlug("travel-health-kit", []), "travel-health-kit");
  assert.equal(uniqueSlug("travel-health-kit", ["travel-health-kit"]), "travel-health-kit-2");
  assert.equal(uniqueSlug("travel-health-kit", ["travel-health-kit", "travel-health-kit-2"]), "travel-health-kit-3");
});

test("meta description enforces 150-160 chars and rejects markup", () => {
  const good = "a".repeat(155);
  assert.equal(validateMetaDescription(good).ok, true);
  assert.equal(validateMetaDescription("a".repeat(149)).ok, false);
  assert.equal(validateMetaDescription("a".repeat(161)).ok, false);
  assert.equal(validateMetaDescription("").ok, false);
  assert.equal(validateMetaDescription(`${"a".repeat(154)}<b>`).ok, false);
  assert.equal(validateMetaDescription(`${"a".repeat(154)}\nx`).ok, false);
});

test("normalizeMetaDescription trims long text at a word boundary and never pads short text", () => {
  const long = `${"word ".repeat(60)}end`;
  const out = normalizeMetaDescription(long);
  assert.ok(out.length <= SEO_LIMITS.metaDescription[1]);
  assert.ok(!out.endsWith(" "), "no trailing space");
  assert.ok(long.startsWith(out.slice(0, 20)), "prefix of the original — nothing invented");

  const short = "Short but real description.";
  assert.equal(normalizeMetaDescription(short), short, "short text is returned as-is, never padded");
});

test("labels come from the cluster, stay 2-4, and dedupe case-insensitively", () => {
  const labels = selectLabels({ title: "Cruise Travel Insurance", keyword: "cruise travel insurance", tags: ["travel insurance", "Cruise"] });
  assert.ok(labels.length >= SEO_LIMITS.labels[0] && labels.length <= SEO_LIMITS.labels[1]);
  const lower = labels.map((l) => l.toLowerCase());
  assert.equal(new Set(lower).size, lower.length, "no case-duplicate labels");

  const bare = selectLabels({ title: "Unclassifiable Topic", keyword: "zzz", tags: [] });
  assert.ok(bare.length >= SEO_LIMITS.labels[0], "always reaches the minimum");
});

test("only published articles with a real https publishedUrl are linkable", () => {
  const ids = linkableArticles(CORPUS).map((a) => a.id);
  assert.ok(!ids.includes("art_007"), "unpublished draft is never linkable");
  assert.equal(ids.length, 4);

  const fake = [{ id: "x", title: "T", status: "published", publishedUrl: "not-a-url" }];
  assert.equal(linkableArticles(fake).length, 0);
});

test("internal links prefer the same cluster and never link to self", () => {
  const links = selectInternalLinks({
    keyword: "medical evacuation coverage", title: "Medical Evacuation Coverage Limits",
    articles: CORPUS, excludeId: "art_010",
  });
  assert.ok(links.length >= SEO_LIMITS.internalLinks[0] && links.length <= SEO_LIMITS.internalLinks[1]);
  assert.ok(!links.some((l) => l.articleId === "art_010"), "never links to itself");
  assert.ok(links.every((l) => l.url.startsWith("https://")));
  assert.equal(links[0].cluster, "medical-abroad", "same-cluster target ranks first");
});

test("validateInternalLinks rejects a URL that is not a real published post", () => {
  const good = selectInternalLinks({ keyword: "travel insurance", title: "T", articles: CORPUS });
  assert.equal(validateInternalLinks(good, { articles: CORPUS }).ok, true);

  const invented = [...good.slice(0, 2), { articleId: "art_x", title: "Ghost", url: "https://atlas-money-2026.blogspot.com/2026/07/does-not-exist.html" }];
  const bad = validateInternalLinks(invented, { articles: CORPUS });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => /실제 공개 URL이 아닙니다/.test(i)));

  const tooFew = validateInternalLinks(good.slice(0, 1), { articles: CORPUS });
  assert.equal(tooFew.ok, false);

  const dup = validateInternalLinks([good[0], good[0]], { articles: CORPUS });
  assert.equal(dup.ok, false);
  assert.ok(dup.issues.some((i) => /중복/.test(i)));
});

test("Related ATLAS Guides html escapes titles and omits itself when empty", () => {
  assert.equal(buildRelatedGuidesHtml([]), "");
  const html = buildRelatedGuidesHtml([{ url: "https://b.com/a.html", title: 'Fire & "Ice" <b>' }]);
  assert.match(html, /Related ATLAS Guides/);
  assert.match(html, /Fire &amp; &quot;Ice&quot; &lt;b&gt;/);
  assert.ok(!/<b>/.test(html.replace(/<\/?(section|h2|ul|li|a)[^>]*>/g, "")));
});

test("authority sources are matched by host, including subdomains", () => {
  assert.equal(hostOf("https://www.cdc.gov/x"), "cdc.gov");
  assert.equal(isAuthoritySource("https://wwwnc.cdc.gov/travel/page/insurance"), true);
  assert.equal(isAuthoritySource("https://travel.state.gov/en/x"), true);
  assert.equal(isAuthoritySource("https://www.medicare.gov/x.pdf"), true);
  assert.equal(isAuthoritySource("https://some-affiliate-blog.com/best-insurance"), false);
  assert.equal(isAuthoritySource("http://cdc.gov/x"), false, "http is not accepted");
  assert.equal(isAuthoritySource("https://notcdc.gov.evil.com/x"), false);
});

test("JSON-LD is one valid Article node and the script tag cannot break out", () => {
  const node = buildJsonLd({
    title: "Cruise Travel Insurance", metaDescription: "d".repeat(155),
    publishedUrl: "https://b.com/a.html",
    visualAssets: [{ publicUrl: "https://res.cloudinary.com/x/featured" }, { publicUrl: "bad" }],
  });
  assert.equal(validateJsonLd(node).ok, true);
  assert.deepEqual(node.image, ["https://res.cloudinary.com/x/featured"], "invalid image urls are dropped");

  assert.equal(validateJsonLd({ "@context": "https://schema.org", "@type": "BlogPosting" }).ok, false);

  const tag = jsonLdScriptTag(buildJsonLd({ title: "</script><script>alert(1)</script>", metaDescription: "x" }));
  assert.ok(!tag.includes("</script><script>"), "closing tag is escaped");
  assert.equal((tag.match(/<\/script>/g) || []).length, 1);
});

test("buildSeoPackage produces every surface at once and reports what is missing", () => {
  const ok = buildSeoPackage(
    { title: "How Cruise Medical Evacuation Limits Work", keyword: "cruise medical evacuation limits", metaDescription: "m".repeat(155), tags: ["cruise"] },
    { articles: CORPUS },
  );
  assert.equal(ok.ok, true, ok.issues.join(" / "));
  assert.equal(ok.cluster, "medical-abroad");
  assert.ok(ok.labels.length >= 2);
  assert.ok(ok.internalLinks.length >= 2);
  assert.match(ok.relatedGuidesHtml, /Related ATLAS Guides/);
  assert.match(ok.jsonLdScript, /application\/ld\+json/);

  const bad = buildSeoPackage({ title: "T", keyword: "travel insurance", metaDescription: "too short" }, { articles: CORPUS });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => /meta description/.test(i)));
});

test("buildSeoPackage assigns a non-colliding slug against the live corpus", () => {
  const pkg = buildSeoPackage(
    { title: "Cruise Travel Insurance", slug: "cruise-travel-insurance", keyword: "cruise", metaDescription: "m".repeat(155) },
    { articles: CORPUS },
  );
  assert.equal(pkg.slug, "cruise-travel-insurance-2", "existing slug forces a new one");
});
