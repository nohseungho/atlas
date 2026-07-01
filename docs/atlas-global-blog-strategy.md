# ATLAS Global Blog Strategy

## 1. Market Direction

**Primary Market: United States**

- English-language content targeting US readers
- AdSense revenue optimization for high-CPC US categories
- Google Search traffic as primary acquisition channel
- Blogger platform for rapid deployment (zero hosting cost)

**Why US-first:**
- Highest AdSense CPC rates globally (Finance, Insurance, Tech, Legal)
- Large English-speaking organic search volume
- No language localization barrier for content scaling

---

## 2. Category Priorities

High-CPC target categories (see `data/atlas/categories.json`):

| Priority | Category | CPC Range | Reason |
|----------|----------|-----------|--------|
| 1 | money | $2–$15 | Finance = highest AdSense CPC |
| 2 | health | $2–$10 | Insurance + supplements |
| 3 | cars | $1–$8 | Auto insurance, EV |
| 4 | ai-tech | $1–$6 | High search volume, growing |
| 5 | travel | $1–$5 | Seasonal but scalable |
| 6 | lifestyle | $0.5–$3 | High volume, evergreen |
| 7 | science | $0.5–$2 | Long-tail, low competition |
| 8 | space | $0.5–$2 | Viral potential |
| 9 | luxury | $2–$8 | Niche, high-intent readers |

---

## 3. Blogger Design Improvements Needed

Current Blogger default themes are insufficient for US market monetization. Required upgrades:

### Layout
- **Magazine layout**: grid-based card design (not single column)
- **Hero image** on homepage and each post (1200×630px minimum)
- **Category navigation bar** with color-coded branding per category
- **Sidebar**: popular posts, category links, newsletter CTA

### Typography & Branding
- Clean sans-serif fonts (Inter, DM Sans, or similar via Google Fonts)
- Category-specific accent colors
- Consistent logo + favicon across all Blogger properties

### SEO Checklist (per post)
- [ ] Title: 50–60 characters, keyword at start
- [ ] Meta description: 150–160 characters
- [ ] URL slug: short, keyword-rich (Blogger auto-generates, needs manual override)
- [ ] First paragraph: keyword within first 100 words
- [ ] H2/H3 headings: 3–5 per article
- [ ] Internal links: 2–3 per post
- [ ] Image alt text on all images
- [ ] FAQ section: 3+ questions (Schema markup target)
- [ ] Word count: 1,200–2,500 words for competitive keywords

---

## 4. Content Expansion Plan

### Phase 1 (Now): Text-only English posts
- 1–3 posts per day per blog
- Keyword-first approach (money score > 60)
- ATLAS Writer generates English content

### Phase 2: Visual Enhancement
- **Hero images**: AI-generated or royalty-free (Unsplash, Pexels)
- **Infographics**: Chart.js or Canva-generated data visualizations
- Embed in Blogger posts via image hosting

### Phase 3: Social Distribution
- **Pinterest**: Infographic pins linking back to blog posts
  - Best for: lifestyle, travel, health, money categories
  - Target: 10–20 pins per post
- **YouTube Shorts / Reels**: 30–60 second text-to-video summaries
  - Tool: ElevenLabs (voice) + Canva / CapCut (visuals)
  - Link in description → Blogger post

### Phase 4: Email & Monetization
- Mailchimp or ConvertKit free tier for newsletter
- AdSense approval target: 20+ quality posts
- Affiliate links: Amazon Associates, Finance affiliates (Credit Karma, NerdWallet-style)

---

## 5. Blog Structure (Per Blogger Property)

Each Blogger blog (`blog_001`, `blog_002`, etc.) should focus on 1–2 categories for topical authority:

```
blog_001 → money + lifestyle (US finance focus)
blog_002 → ai-tech + science
blog_003 → travel + luxury
```

*Assign categories in `data/atlas/blogs.json` → `categoryFocus` field*

---

## 6. ATLAS Toolchain Roadmap

| Feature | Status |
|---------|--------|
| Korean content generation | ✅ Done |
| Blogger auto-publish | ✅ Done |
| English content generation | 🔲 Planned |
| Category-based keyword scoring | 🔲 Planned |
| Image attachment in post | 🔲 Planned |
| Pinterest auto-pin | 🔲 Planned |
| Multi-blog rotation | 🔲 Planned |
| AdSense performance tracking | 🔲 Planned |

---

## 7. Notes

- Keep `data/atlas/categories.json` as the single source of truth for category definitions
- English article generation logic is NOT yet implemented — this doc defines the direction only
- Blogger URL structure cannot be customized per-post without manual editing; plan accordingly
- `bloggerBlogId` is now auto-saved on OAuth connect (since 2026-07-01)
