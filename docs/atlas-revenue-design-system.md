# ATLAS Revenue Design System — V1

**Status:** Draft for adoption. Once approved, this is the official design/UX/monetization spec every ATLAS-generated blog must follow.
**Scope of this Sprint:** Analysis + Design System spec only. No code was changed (Publisher, Dashboard, Blog Manager, Auto Publish, OAuth are untouched).

---

## 0. Executive Summary

ATLAS can now publish content end-to-end. It cannot yet make money reliably, because the actual rendered output — verified directly from the code (`lib/atlas/revenue-design-engine.js`, `lib/html-exporter.js`) and the two real articles currently in the system — has structural problems that block revenue regardless of how good the writing is:

1. **Zero images anywhere in the pipeline.** No hero image, no inline image, no icon. Every ATLAS post is 100% text.
2. **The affiliate CTA link is a literal dead link (`href="#"`).** Even when the CTA box renders, it goes nowhere.
3. **All UI "chrome" is hardcoded in Korean** (ToC label "목차", "핵심 포인트", "자주 묻는 질문 (FAQ)", comparison table headers "항목/옵션 A/옵션 B", CTA copy, author box) — even on the English MASTER (`art_002`, the travel insurance article). A global/English reader would see Korean labels wrapped around English content.
4. **The comparison table is empty scaffolding** (`—` placeholder cells), not real data.
5. **CTA only appears after the full body**, never above the fold or mid-article.
6. **Trust/author signal is one generic sentence**, no credentials, no update-history — weak for YMYL categories (insurance, money) where Google and readers both scrutinize trust signals hardest.

None of this is about "prettiness." Each point above is a specific, named reason a real visitor would bounce, not click, or not convert — verified against the actual code path that runs today.

---

## 1. Phase 1 — Current Blogger Diagnosis (Visitor's Point of View)

Diagnosis is based on the **actual HTML-generation logic** (`buildRevenueHtml`, `buildBloggerHtml`, `markdownToHtml`) and the **actual two articles currently in ATLAS**:

- `art_001` — 자동차 보험 다이렉트 가입 (Korean, already published live to Blogger, template unset → defaults to `"guide"`)
- `art_002` — Best Travel Insurance for International Trips (English MASTER, `template: "review"`, attempted publish, blocked on OAuth until recently)

| Item | Score (1-5) | Finding | Why it costs money |
|---|---|---|---|
| 첫인상 (Hero) | 1 | No image anywhere in the render pipeline | First 1-2 seconds decide bounce. Pure text = looks like a stub/spam page next to any real competitor |
| 신뢰도 / Trust Signal | 2 | Author box = one generic sentence, no name/credentials/photo, no "last verified" signal beyond a raw date | YMYL categories (보험/금융) are exactly where Google + readers demand visible expertise signals |
| 전문성 | 2 | Content quality (from the Writer DNA work) is actually good, but visual presentation doesn't reinforce it — no data viz, no real numbers in the "comparison table," no citations | Good writing gets undermined by a "template-y" shell |
| 가독성 | 4 | Short paragraphs, `##` headers, bullet lists render cleanly; inline CSS is legible, decent contrast | This is a real strength — keep it |
| 모바일 | 4 | `overflow-x:auto` on the table, relative widths, no fixed-px layout traps | Structurally fine; untested visually (no browser tool in this environment) |
| CTA | 2 | CTA box only appears **after** the entire body (bottom of `bottomParts`), never near the top or mid-article; and its link is `href="#"` | Most clicks happen early or right after the "quick answer" — a bottom-only, dead-linked CTA captures close to nothing |
| 광고 위치 | N/A | No ad markup in generated content — ads are a Blogger-theme-level concern, not a content-injection concern in this codebase | Not a content defect, but should be decided explicitly (see Phase 4) |
| Affiliate 위치 | 2 | Only one placement point exists (`productSlotsBox` or generic CTA box), always at the bottom, and only if `affiliatePlan` is populated (often isn't) | Single-shot, bottom-only affiliate placement under-monetizes long articles |
| FAQ | 4 | Renders cleanly from a real `faq[]` array (Q/A card list), consistent structure | Good — matches "FAQ schema" SEO best practice in spirit (though no actual `FAQPage` structured data is emitted — see Phase 4 SEO) |
| TOC | 3 | Renders automatically from `## ` headings when ≥2 exist — functionally solid, but labeled "목차" even in English posts | Mechanism is good, language binding is broken |
| Heading 구조 | 4 | Clean `##`→`<h2>` mapping, consistent throughout | Strength |
| 이미지 | 1 | None. At all. | See Executive Summary #1 |
| 카드 디자인 | 3 | Summary/Key-Takeaways/Product-slot boxes use consistent rounded corners + accent-left-border pattern — a real, reusable visual language already exists in the code | Worth formalizing (Phase 3/4), not reinventing |
| 버튼 | 2 | One CTA button style exists, but it's Korean-labeled, "#"-linked, and shows once | Needs a real button system (Phase 4) |
| 관련글 (Related Posts) | 0 | Doesn't exist in the pipeline at all | No internal linking = no compounding pageviews/session, directly hurts Adsense RPM math |
| Footer | 0 (per-post) | No per-post footer content beyond the one-line author box; site-wide footer is a Blogger-theme concern, not evaluated here | — |
| Header | N/A | Site-wide, Blogger-theme level, not in this codebase's scope | Flag for the theme-selection decision in Phase 4 |
| 색상 | 4 | Existing accent palette (blue `#2563eb`, green `#065f46`/`#bbf7d0`, amber `#fcd34d`) is coherent and modern | Strength — formalize as the official palette |
| 폰트 | 3 | `system-ui, -apple-system, sans-serif` — safe, legible, but generic; no defined type scale (H2 vs body sizes are ad hoc across box builders) | Needs a real typographic scale (Phase 4) |
| 클릭하고 싶은가 (Hook) | 4 (content) / 2 (page) | The Writer DNA hooks (established earlier this project) are genuinely strong on the page-title level; the page shell doesn't reinforce that hook visually (no hero, no sub-hook visual) | Content and shell are mismatched in quality |
| 읽고 싶은가 | 4 | Prose rhythm (short sentences/paragraphs) reads well | Strength |
| 끝까지 읽게 되는가 | 3 | No progress indicator, no "estimated read time," no visual pacing beyond the TOC | Middling — a few cheap additions would help a lot |
| 왜 그런가 (root cause) | — | The **content layer** (Writer DNA) has already been solved. The **shell/presentation layer** (images, real CTA links, language-consistent chrome, trust signals, internal links) has not. This is a rendering/design-system gap, not a writing gap. | — |

### Critical, code-verified bugs (not opinions)

1. **Dead CTA link**: `buildAffiliateCtaBox()` in `revenue-design-engine.js` hardcodes `href="#"`.
2. **Language leak**: every box builder (`buildTableOfContents`, `buildKeyTakeaways`, `buildComparisonTablePlaceholder`, `buildFaqBlock`, `buildAffiliateCtaBox`, `buildAuthorBox`) hardcodes Korean strings regardless of article language — this will visibly break on every future English/global MASTER (like `art_002`) the moment it's actually published.
3. **Empty comparison table**: cells are literally the em-dash placeholder (`—`), not real data, whenever `template === "review"`.
4. **No image field exists anywhere** in the article schema or the rendering pipeline — this isn't a bug so much as a missing capability.

**Priority to fix (highest revenue impact first):** (1) language-consistent chrome → (2) real CTA links tied to `affiliatePlan` → (3) at least one hero/inline image → (4) trust/author signal upgrade → (5) related-posts block → (6) real comparison-table data.

---

## 2. Phase 2 — Revenue Blog Benchmark Database

These are well-documented, publicly observable sites in exactly ATLAS's target categories (affiliate/Adsense/travel/insurance/product-review). The patterns below are the widely-recognized, structurally consistent elements these sites use — verifiable by visiting them — not internal metrics.

| # | Site | Category | Why it converts (3 core reasons) |
|---|---|---|---|
| 1 | **NerdWallet** | Money/Insurance | (a) "Our take" quick-verdict box above the fold before any detail (b) visible star ratings + methodology link = trust (c) sticky comparison table with an inline "Apply Now" button per row — CTA is *inside* the data, not after it |
| 2 | **The Points Guy (TPG)** | Travel/Credit cards | (a) Hero image + bonus-value callout in the first screen (b) persistent sidebar/sticky CTA card that follows scroll (c) heavy internal linking ("Related: ...") between card/travel posts, compounding session depth |
| 3 | **Wirecutter (NYT)** | Product Review | (a) "Also great / Budget pick / Upgrade pick" tiered structure gives every reader a CTA regardless of budget (b) visible testing methodology section = extreme trust signal (c) large product photography at every recommendation |
| 4 | **ValuePenguin** | Insurance/Money | (a) State-by-state / provider-by-provider real data tables, not placeholders (b) short "bottom line" callout boxes every 2-3 sections, not just at the end (c) FAQ block targeting exact long-tail queries (matches People Also Ask) |
| 5 | **Forbes Advisor** | Insurance/Money | (a) Star-rating badge + "Best for X" persona tags per product, so different readers self-select instantly (b) comparison table pinned near the top, before the essay-style content (c) disclosure box styled distinctly, building regulatory trust rather than hiding it |
| 6 | **Nomadic Matt** | Travel | (a) Extremely strong personal-authority framing (bio, photo, "as seen in" logos) — the E-E-A-T trust layer TPG/Wirecutter also use (b) budget breakdown tables with real numbers (c) affiliate links embedded naturally inside "how I book" narrative, not bolted on at the end |
| 7 | **Money Under 30** | Money | (a) Persona-based headers ("For beginners," "If you have debt") so the CTA context matches the reader (b) short paragraph + frequent subheads, near-zero walls of text (c) mid-article CTA boxes, not just top/bottom |
| 8 | **RTings.com** | Product Review | (a) Literal lab-test numbers/photos as trust signal — the opposite of a placeholder table (b) comparison tool letting readers pick 2-3 products live (c) "Updated [date] — see changelog" visible freshness signal |
| 9 | **PolicyGenius (blog)** | Insurance | (a) Quick-answer 1-2 sentence box before any explanation (b) licensed-agent bylines with credentials, critical for YMYL trust (c) clear "get a quote" CTA repeated at natural decision points, not just the end |
| 10 | **Skyscanner (travel guides)** | Travel | (a) Heavy use of real photography and simple iconography per section (b) sticky booking-search widget always visible (c) short FAQ targeting exact voice-search-style questions |

### Cross-site pattern synthesis (what all 10 agree on)

- **Quick answer / verdict above the fold** — every single one does this.
- **Real numbers/photos, never placeholders** — the #1 difference from ATLAS's current output.
- **CTA repeated at 2-3 points**, not just bottom.
- **Visible trust signal** (credentials, methodology, "as seen in," last-updated) is universal in YMYL categories.
- **Internal linking / related content** is universal — none of these treat a post as an island.
- **Persona-aware framing** ("best for beginners," "if you have X") lets different readers self-select their CTA.

---

## 3. Phase 3 — ATLAS Design Pattern Database

Patterns already partially implemented in `revenue-design-engine.js` are marked **[EXISTS]**; new patterns to add are marked **[NEW]**.

| Pattern | Definition | Status | Rationale |
|---|---|---|---|
| Header Pattern | Site-wide nav + logo + search | Blogger-theme level, outside this codebase | Decide once, apply to every ATLAS blog theme |
| Hero Pattern | Title + 1 image + 1-line hook, above the fold | **[NEW]** | Fixes Executive Summary #1 |
| Quick Answer / Summary Pattern | 1-3 sentence verdict box before any detail | **[EXISTS]** (`buildSummaryBox`) | Already matches Benchmark DB universal pattern — keep, just make language-aware |
| TOC Pattern | Auto-generated from `##` headings, ≥2 required | **[EXISTS]** (`buildTableOfContents`) | Keep mechanism, fix language binding |
| Key Takeaways / Info Card Pattern | Bulleted highlight box, top of article | **[EXISTS]** (`buildKeyTakeaways`) | Keep |
| Warning / Disclaimer Pattern | Distinctly-styled box (not plain `<p>`) for legal/YMYL disclaimers | **[NEW]** (currently plain markdown text for `art_001`'s "이 글의 한계" section; only styled when `affiliatePlan.disclosure` exists) | Trust signal — must always render styled, not conditionally |
| Comparison Table Pattern | Real provider/plan rows, not `—` placeholders | **[EXISTS mechanism / NEW data]** (`buildComparisonTablePlaceholder`) | Needs real data source, not scaffolding |
| Pros/Cons Pattern | Two-column green/red list | **[NEW]** | Universal in Benchmark DB, absent in ATLAS today |
| FAQ Pattern | Q/A card list from `faq[]` | **[EXISTS]** (`buildFaqBlock`) | Keep, add `FAQPage` JSON-LD (SEO win, see Phase 4) |
| CTA / Affiliate Pattern | Real link (never `#`), repeated at top+mid+bottom | **[EXISTS mechanism, broken link, wrong frequency]** | Highest-priority fix |
| Related Articles Pattern | 3-4 internal links at the end | **[NEW]** | Universal in Benchmark DB, absent in ATLAS today |
| Trust / Author Pattern | Name + role + 1-line credential + last-updated date | **[NEW]** (currently one generic sentence) | Critical for YMYL categories |
| Card Pattern | Rounded corner + left accent border + consistent padding | **[EXISTS]**, already visually coherent across box builders | Formalize as the shared card component spec |
| Button Pattern | One consistent primary/secondary button style | **[EXISTS but single-use]** | Extend to multiple CTA placements |
| Spacing Pattern | 24-32px block margins already used consistently | **[EXISTS]** | Formalize as spacing scale |
| Typography Pattern | `system-ui` stack, but no defined size scale | **[NEW]** | Define H1/H2/H3/body/caption scale explicitly |
| Color Pattern | Blue/green/amber accents already coherent | **[EXISTS]** | Formalize as token palette |
| Image Pattern | None | **[NEW]** | See Executive Summary #1 |

---

## 4. Phase 4 — ATLAS Revenue Design System V1 (Spec)

### Color
- **Primary (links/CTA):** `#2563eb` (blue) — already used, keep
- **Success/Trust accent:** `#065f46` text on `#bbf7d0`/`#f0fdf4` background — already used, keep
- **Warning/Disclaimer accent:** `#92400e` text on `#fef3c7`/`#fffbeb` background (new — currently amber `#fcd34d` is CTA-only; disclaimer needs its own distinct tone so it isn't confused with the CTA box)
- **Neutral text:** `#1a1a2e` (heading) / `#374151` (body) / `#6b7280` (caption) — already used, keep
- **Rule:** Warning and CTA must never share the same color family — a reader must be able to tell "this is a caution" from "this is an action" at a glance.

### Typography
- Font stack: `system-ui, -apple-system, sans-serif` (keep — safe, fast, legible)
- Scale: H2 `20px/700`, H3 `16px/700`, body `15px/1.7`, caption `12-13px/1.5` — codify these exact values across every box builder (currently ad hoc per function)

### Layout
- Single column, max content width matching current Publisher preview conventions
- Order: **Hero → Quick Answer → TOC → Key Takeaways → Body (with 1 inline image per ~800 words + 1 mid-CTA) → Comparison Table (real data) → Pros/Cons → FAQ → Related Articles → Author/Trust box → Disclaimer**

### Card
- Rounded `8px` corners, `1px` border in neutral gray, left accent border (`4px`) color-coded by box type (blue=info, green=trust/takeaway, amber=CTA, new warning-amber=disclaimer)

### CTA / Affiliate
- **Rule 1:** Every CTA `href` must resolve from `article.affiliatePlan` — never a literal `#`. If no real link exists yet, do not render the CTA box at all (a missing CTA is better than a dead one).
- **Rule 2:** Minimum 2 CTA placements — one right after Quick Answer, one after the Comparison Table/Pros-Cons, matching the Benchmark DB's "repeated at natural decision points" finding.
- **Rule 3:** CTA copy must be generated in the article's own language, not hardcoded.

### FAQ
- Keep existing `faq[]` → card list mechanism.
- **Add:** emit `FAQPage` JSON-LD structured data alongside the visible HTML (pure SEO upside, no visual change, doesn't touch existing rendering logic).

### TOC
- Keep existing auto-generation from `##` headings.
- **Fix:** label must be derived from the article's language (e.g. "Table of Contents" vs "목차"), not hardcoded.

### Table (Comparison)
- Keep existing responsive `overflow-x:auto` wrapper.
- **Fix:** populate from real structured data (provider name, price/coverage, "best for" tag) instead of `—` placeholders; if no real data exists, omit the table rather than show empty scaffolding.

### Button
- One primary style (solid blue/brand color) for the main CTA, one secondary style (outline/gray) for "learn more"/internal links — currently only one style exists, reused inconsistently.

### Spacing
- Codify the already-used `24-32px` block margin as the standard vertical rhythm between all page sections.

### Mobile
- Keep existing relative-width, `overflow-x:auto` patterns (structurally sound already based on code review).
- Add: images must use `max-width:100%; height:auto` when introduced.

### SEO
- Add `FAQPage` and `Article` JSON-LD structured data.
- Ensure every post has exactly one real image with descriptive `alt` text once the Image Pattern lands (image alt text is itself an SEO signal, not just an accessibility one).

### Trust
- Author/reviewer name + one-line credential + "last updated" date, styled distinctly from the plain author sentence used today.
- For YMYL categories (insurance/money) specifically: require a visible disclaimer box (not plain text) on every post, no exceptions.

---

## 5. Application Plan

**Sprint 1 — Fix what's broken (highest ROI, lowest risk)**
- Make CTA `href` come from real `affiliatePlan` data; never render a dead `#` link.
- Make all box-builder chrome text (TOC label, Key Takeaways label, FAQ heading, CTA copy, author sentence, comparison table headers) derive from the article's language instead of being hardcoded Korean.
- Give the Warning/Disclaimer box its own distinct styled treatment (separate from CTA amber).

**Sprint 2 — Add what's missing**
- Add an image field to the article schema + at least one hero image per post.
- Add a Related Articles block (3-4 internal links) at the end of every post.
- Upgrade the Author/Trust box (name, credential line, last-updated).

**Sprint 3 — Compound the gains**
- Replace comparison-table placeholders with real structured data per category.
- Add Pros/Cons two-column pattern.
- Emit `FAQPage`/`Article` JSON-LD structured data.
- Add a second CTA placement (post-Quick-Answer, not just post-body).

Each Sprint above should be run as its own ATLAS Sprint (one feature at a time, tested, git'd, then next) per the existing ATLAS Sprint Execution Policy — this document only defines *what* the design system should be, not an authorization to implement it yet.
