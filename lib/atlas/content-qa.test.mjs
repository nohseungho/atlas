import test from "node:test";
import assert from "node:assert/strict";
import { runContentQa, VERDICT } from "./content-qa.js";
import { buildJsonLd } from "./seo-engine.js";

const LIVE = [
  { id: "art_009", title: "Cruise Travel Insurance: How to Compare Medical Evacuation Coverage", slug: "cruise-travel-insurance", status: "published", publishedUrl: "https://atlas-money-2026.blogspot.com/2026/07/cruise-travel-insurance-how-to-compare.html" },
  { id: "art_004", title: "What to Do If You Get Sick While Traveling Abroad", slug: "sick-abroad", status: "published", publishedUrl: "https://atlas-money-2026.blogspot.com/2026/07/what-to-do-if-you-get-sick-while-traveling-abroad.html" },
  { id: "art_002", title: "Travel Insurance for International Trips: What to Compare First", slug: "best-travel-insurance", status: "published", publishedUrl: "https://atlas-money-2026.blogspot.com/2026/07/best-travel-insurance-for-international.html" },
];

const IMG = (key, alt) => ({ key, alt, publicUrl: `https://res.cloudinary.com/dmfbj4tu/image/upload/x/${key}` });

function goodArticle(overrides = {}) {
  const base = {
    id: "art_011",
    title: "Delayed Baggage Claim Rules U.S. Travelers Should Know",
    slug: "delayed-baggage-claim-rules",
    metaDescription: "m".repeat(155),
    bodyHtml: [
      "<h2>Quick Answer</h2><p>Airlines must handle delayed bags under DOT rules, and reimbursement depends on documented expenses.</p>",
      "<h2>The Money at Risk</h2><p>Typical interim expenses can add up over several days of waiting.</p>",
      '<div style="overflow-x:auto;"><table><tr><td>Domestic</td><td>DOT rules apply</td></tr></table></div>',
      "<h2>Common Mistakes</h2><p>Travelers often discard receipts, which usually limits what a carrier will reimburse.</p>",
      "<h2>FAQ</h2><p>Five questions follow.</p>",
      "<h2>Sources &amp; References</h2><p>See the disclaimer below.</p>",
      '<img src="https://res.cloudinary.com/x/featured" alt="Traveler waiting at an airport baggage carousel" style="width:100%;height:auto;" />',
    ].join("\n"),
    sources: [
      { title: "DOT baggage rules", url: "https://www.transportation.gov/individuals/aviation-consumer-protection/baggage" },
      { title: "TSA guidance", url: "https://www.tsa.gov/travel/security-screening" },
      { title: "State Dept", url: "https://travel.state.gov/en/international-travel/planning/guidance/insurance.html" },
    ],
    visualAssets: [
      IMG("featured", "Traveler waiting at an airport baggage carousel"),
      IMG("context", "Airline service desk handling a delayed baggage report"),
      IMG("comparison", "Side by side comparison of domestic and international baggage rules"),
      IMG("action", "Passenger filing a written baggage claim form at the counter"),
      IMG("checklist", "Printed checklist of receipts to keep after a baggage delay"),
    ],
    internalLinks: [
      { articleId: "art_002", title: LIVE[2].title, url: LIVE[2].publishedUrl },
      { articleId: "art_004", title: LIVE[1].title, url: LIVE[1].publishedUrl },
    ],
  };
  const article = { ...base, ...overrides };
  article.jsonLd = overrides.jsonLd ?? buildJsonLd(article);
  return article;
}

const check = (res, id) => res.checks.find((c) => c.id === id);

test("a compliant article passes and stays blocked from publishing until a human approves", () => {
  const res = runContentQa(goodArticle(), { articles: LIVE });
  assert.equal(res.pass, true, JSON.stringify(res.blocking));
  assert.equal(res.gates.canApprove, true);
  assert.equal(res.gates.canSchedule, true);
  assert.equal(res.gates.canPublish, false, "QA alone never unlocks publishing");
});

test("fabrication is reported as needing human review, never as a PASS", () => {
  const res = runContentQa(goodArticle(), { articles: LIVE });
  assert.equal(check(res, "fabrication").status, VERDICT.REVIEW);
  assert.equal(res.needsHumanReview.length >= 1, true);
  assert.ok(!res.checks.some((c) => c.id === "fabrication" && c.status === VERDICT.PASS));
});

test("missing title / body / meta description each block publishing", () => {
  for (const patch of [{ title: "" }, { bodyHtml: "" }, { metaDescription: "" }]) {
    const res = runContentQa(goodArticle(patch), { articles: LIVE });
    assert.equal(res.pass, false);
    assert.equal(res.gates.canApprove, false);
  }
});

test("meta description outside 150-160 chars fails", () => {
  const short = runContentQa(goodArticle({ metaDescription: "m".repeat(120) }), { articles: LIVE });
  assert.equal(check(short, "metaDescription").status, VERDICT.FAIL);
  const long = runContentQa(goodArticle({ metaDescription: "m".repeat(200) }), { articles: LIVE });
  assert.equal(check(long, "metaDescription").status, VERDICT.FAIL);
});

test("placeholder and unfinished text is caught", () => {
  const res = runContentQa(goodArticle({ bodyHtml: "<h2>Quick Answer</h2><p>TODO: write this section.</p>" }), { articles: LIVE });
  assert.equal(check(res, "placeholder").status, VERDICT.FAIL);
  assert.equal(res.pass, false);
});

test("a duplicate of an existing article is blocked", () => {
  const byTitle = runContentQa(goodArticle({ title: LIVE[1].title }), { articles: LIVE });
  assert.equal(check(byTitle, "duplicate").status, VERDICT.FAIL);

  const bySlug = runContentQa(goodArticle({ slug: "cruise-travel-insurance" }), { articles: LIVE });
  assert.equal(check(bySlug, "duplicate").status, VERDICT.FAIL);
});

test("absolute medical / insurance guarantees are blocked", () => {
  for (const claim of [
    "You will be covered for every hospital bill abroad.",
    "This policy guarantees reimbursement within 10 days.",
    "Travel insurance always pays for evacuation.",
    "Your claim is never denied when you file on time.",
  ]) {
    const res = runContentQa(goodArticle({ bodyHtml: `<h2>Quick Answer</h2><p>${claim}</p>` }), { articles: LIVE });
    assert.equal(check(res, "noGuarantee").status, VERDICT.FAIL, `must reject: ${claim}`);
  }
});

test("descriptive, hedged insurance wording is allowed", () => {
  const ok = runContentQa(
    goodArticle({ bodyHtml: goodArticle().bodyHtml.replace("<h2>Quick Answer</h2>", "<h2>Quick Answer</h2><p>Most policies typically reimburse documented expenses, but confirm the wording before you buy.</p>") }),
    { articles: LIVE },
  );
  assert.equal(check(ok, "noGuarantee").status, VERDICT.PASS);
});

test("fewer than 3 authority sources fails, and marketing blogs do not count", () => {
  const marketing = runContentQa(
    goodArticle({
      sources: [
        { url: "https://www.transportation.gov/x" },
        { url: "https://best-insurance-deals.example.net/a" },
        { url: "https://another-affiliate-blog.net/b" },
      ],
    }),
    { articles: LIVE },
  );
  assert.equal(check(marketing, "authoritySources").status, VERDICT.FAIL);
  assert.match(check(marketing, "authoritySources").reason, /권위 출처 1개/);
});

test("internal links must resolve to real published URLs", () => {
  const invented = runContentQa(
    goodArticle({ internalLinks: [{ articleId: "art_x", title: "Ghost", url: "https://atlas-money-2026.blogspot.com/2026/07/ghost.html" }, { articleId: "art_002", title: "T", url: LIVE[2].publishedUrl }] }),
    { articles: LIVE },
  );
  assert.equal(check(invented, "internalLinks").status, VERDICT.FAIL);

  const tooFew = runContentQa(goodArticle({ internalLinks: [] }), { articles: LIVE });
  assert.equal(check(tooFew, "internalLinks").status, VERDICT.FAIL);
});

test("image count, public URL and unique descriptive alt are enforced", () => {
  const four = runContentQa(goodArticle({ visualAssets: goodArticle().visualAssets.slice(0, 4) }), { articles: LIVE });
  assert.equal(check(four, "images").status, VERDICT.FAIL);

  const placeholderAlt = goodArticle();
  placeholderAlt.visualAssets[0] = IMG("featured", "featured image");
  assert.equal(check(runContentQa(placeholderAlt, { articles: LIVE }), "images").status, VERDICT.FAIL);

  const dupAlt = goodArticle();
  dupAlt.visualAssets[1] = IMG("context", dupAlt.visualAssets[0].alt);
  assert.match(check(runContentQa(dupAlt, { articles: LIVE }), "images").reason, /중복/);
});

test("mobile-breaking layout is caught", () => {
  const fixed = runContentQa(goodArticle({ bodyHtml: '<h2>H</h2><img src="https://res.cloudinary.com/x/a" alt="A traveler checking a departure board" style="width:960px;" />' }), { articles: LIVE });
  assert.equal(check(fixed, "mobile").status, VERDICT.FAIL);

  const bareTable = runContentQa(goodArticle({ bodyHtml: `${goodArticle().bodyHtml}<table><tr><td>x</td></tr></table>` }), { articles: LIVE });
  assert.match(check(bareTable, "mobile").reason, /가로 스크롤 래퍼가 없는 표/);
});

test("any sales surface is blocked while affiliate is unapproved", () => {
  for (const html of [
    '<h2>H</h2><p><a href="https://amzn.to/xyz">Buy now</a></p>',
    "<h2>H</h2><!-- AFFILIATE_LINK: kit -->",
    '<h2>H</h2><a href="https://www.amazon.com/dp/B01?tag=atlas-20">Shop now</a>',
  ]) {
    const res = runContentQa(goodArticle({ bodyHtml: html }), { articles: LIVE });
    assert.equal(check(res, "affiliate").status, VERDICT.FAIL, `must reject: ${html}`);
  }
});

test("ad-click solicitation is blocked", () => {
  const res = runContentQa(goodArticle({ bodyHtml: "<h2>H</h2><p>Support this blog by clicking the ads below.</p>" }), { articles: LIVE });
  assert.equal(check(res, "adBait").status, VERDICT.FAIL);
});

test("blocking list names every failed rule so the UI can show the reason", () => {
  const res = runContentQa(goodArticle({ metaDescription: "short", internalLinks: [], visualAssets: [] }), { articles: LIVE });
  assert.equal(res.pass, false);
  const ids = res.blocking.map((b) => b.id);
  assert.ok(ids.includes("metaDescription") && ids.includes("internalLinks") && ids.includes("images"));
  assert.ok(res.blocking.every((b) => b.reason && b.label));
  assert.match(res.summary, /발행 차단/);
});
