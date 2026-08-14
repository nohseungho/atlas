// ─── Traffic kit (6단계 트래픽 배포) ─────────────────────────────────────────
// Turns ONE PUBLISHED article into the material a person needs to get it seen
// on Pinterest and Google. It creates nothing new about the article: every line
// of copy is lifted from the article's own title, core question, meta
// description, "Common Mistakes" and "What to Do Before You Travel" sections,
// so a pin can never claim something the guide does not say.
//
// No Pinterest API, no Search Console API, no AI image API, no scheduling and
// no auto-posting: this module only prepares text + an image URL the operator
// copies by hand. Pure (no IO) so every rule here is unit-testable.
import {
  buildPinImage,
  buildPinDescription,
  deriveHook,
  derivePinTitle,
  pinFilename,
  sanitizeOverlayText,
  truncateAtWord,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
  PIN_TITLE_MAX,
} from "./pinterest-kit.js";
import { selectInternalLinks } from "./seo-engine.js";

const OVERLAY_MAX = 52;
// 오늘 / 4일 후 / 9일 후 — 같은 글의 핀 3장을 하루에 몰아 올리지 않기 위한 간격.
export const VARIANT_OFFSET_DAYS = [0, 4, 9];
// A candidate only counts as related when it shares the cluster (+3) or three
// title words; anything below that would be an unrelated link.
const RELATED_MIN_SCORE = 3;
const SEARCH_STATUS = ["unchecked", "indexed", "not_indexed"];
export const SEARCH_STATUS_VALUES = SEARCH_STATUS;

export const VARIANTS = [
  { id: "question", label: "핵심 질문형" },
  { id: "mistake", label: "실수·경고형" },
  { id: "checklist", label: "체크리스트·행동형" },
];

const CTA = {
  question: "Read the full ATLAS guide before you book.",
  mistake: "See the full list of mistakes in the ATLAS guide.",
  checklist: "Get the full pre-trip checklist in the ATLAS guide.",
};

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

function textOf(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Items under the first H2/H3 whose text matches `pattern`, stopping at the next
// heading. <li> first, otherwise <p> — the MASTER skeleton writes both shapes.
export function sectionItems(html, pattern) {
  const source = String(html || "");
  const headings = [...source.matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const at = headings.findIndex((h) => pattern.test(textOf(h[2])));
  if (at < 0) return [];
  const start = headings[at].index + headings[at][0].length;
  const end = at + 1 < headings.length ? headings[at + 1].index : source.length;
  const segment = source.slice(start, end);
  const lis = [...segment.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => textOf(m[1]));
  const items = lis.length ? lis : [...segment.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => textOf(m[1]));
  return items.filter((t) => t.length > 20);
}

// The first clause of a sentence — used for overlay text, which has to read as
// one line rather than a truncated paragraph.
export function leadClause(sentence) {
  const s = String(sentence || "").replace(/\s+/g, " ").trim();
  const cut = s.split(/[.;:]|\s[—–-]\s/)[0] || s;
  return cut.trim();
}

function overlayFrom(sentence) {
  const base = sanitizeOverlayText(leadClause(sentence)).toUpperCase();
  return truncateAtWord(base, OVERLAY_MAX);
}

function titleFrom(prefix, sentence) {
  const clause = leadClause(sentence).replace(/^[a-z]/, (c) => c.toUpperCase());
  return truncateAtWord(prefix ? `${prefix}: ${clause}` : clause, PIN_TITLE_MAX);
}

// Whole sentences only, from the article's own text, until the description sits
// inside Pinterest's usable range. Never pads and never invents.
function composeDescription(pool, cta) {
  const seen = new Set();
  let text = "";
  for (const raw of pool) {
    const sentence = String(raw || "").replace(/\s+/g, " ").trim();
    if (!sentence) continue;
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    const withPeriod = /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
    const next = text ? `${text} ${withPeriod}` : withPeriod;
    if (next.length > DESCRIPTION_MAX - cta.length - 1) continue;
    seen.add(key);
    text = next;
    if (text.length + cta.length + 1 >= DESCRIPTION_MIN) break;
  }
  const full = text ? `${text} ${cta}` : cta;
  return full.length <= DESCRIPTION_MAX ? full : truncateAtWord(full, DESCRIPTION_MAX);
}

function assetUrl(asset) {
  return asset?.publicUrl || asset?.url || "";
}

// Different image per variant, from the article's own five uploads. Falls back
// to any unused asset, and only repeats one when the article has fewer than
// three distinct images.
function pickAssets(article) {
  const assets = (article?.visualAssets || []).filter((a) => assetUrl(a));
  const byKey = (key) => assets.find((a) => a.key === key);
  const order = [
    ["featured", "context"],
    ["comparison", "context", "action"],
    ["checklist", "action", "context"],
  ];
  const used = new Set();
  return order.map((prefs) => {
    const hit =
      prefs.map(byKey).find((a) => a && !used.has(assetUrl(a))) ||
      assets.find((a) => !used.has(assetUrl(a))) ||
      assets[0] ||
      null;
    if (hit) used.add(assetUrl(hit));
    return hit;
  });
}

// 날짜는 운영자가 보는 달력(Asia/Seoul) 기준이다. UTC로 계산하면 한국 시간
// 자정~오전 9시 사이에 "오늘"이 하루 전으로 표시된다.
const DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isoDay(date) {
  return DAY_FMT.format(date);
}

export function addDays(dateish, days) {
  const base = dateish instanceof Date ? dateish : new Date(dateish);
  if (Number.isNaN(base.getTime())) return null;
  const [y, m, d] = isoDay(base).split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function brandLineFor(publishedUrl) {
  try {
    return `ATLAS · ${new URL(publishedUrl).host}`;
  } catch {
    return "ATLAS";
  }
}

function hashtagsFor(article) {
  const source = [...(article?.tags || []), ...(article?.seoLabels || []), ...(article?.topicEntities || [])];
  const seen = new Set();
  const tags = [];
  for (const raw of source) {
    const tag = String(raw || "")
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("");
    if (tag.length < 4 || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(`#${tag}`);
    if (tags.length === 5) break;
  }
  return tags;
}

// The three pins. Each one is built from a DIFFERENT part of the article, which
// is what makes the copy genuinely different rather than a reworded clone.
export function buildVariants({ article, storedKit = null, now = new Date() } = {}) {
  const body = article?.bodyHtml || article?.bodyMarkdown || "";
  const mistakes = sectionItems(body, /common mistakes|mistakes to avoid/i);
  const actions = sectionItems(body, /what to do before|before you (travel|book|go)|action plan|steps to take/i);
  const quick = sectionItems(body, /quick answer/i);
  const link = String(article?.publishedUrl || "").trim();
  const brandLine = brandLineFor(link);
  const assets = pickAssets(article);
  const hashtags = hashtagsFor(article);
  const notes = [];

  if (!mistakes.length) notes.push("본문에 ‘Common Mistakes’ 절이 없어 2번 변형은 핵심 질문·메타 설명에서 문구를 가져왔습니다.");
  if (!actions.length) notes.push("본문에 ‘What to Do Before You Travel’ 절이 없어 3번 변형은 권장 행동 문장에서 문구를 가져왔습니다.");

  const sources = [
    {
      id: "question",
      overlay: deriveHook(article),
      title: derivePinTitle(article),
      description: buildPinDescription(article),
    },
    {
      id: "mistake",
      overlay: overlayFrom(mistakes[0] || article?.coreQuestion || article?.title),
      title: titleFrom("Common mistake", mistakes[0] || article?.coreQuestion || article?.title),
      description: composeDescription([...mistakes, article?.metaDescription, article?.coreQuestion], CTA.mistake),
    },
    {
      id: "checklist",
      overlay: overlayFrom(actions[0] || article?.desiredReaderAction || article?.title),
      title: titleFrom("Before you book", actions[0] || article?.desiredReaderAction || article?.title),
      description: composeDescription(
        [...actions, article?.desiredReaderAction, ...quick, article?.metaDescription],
        CTA.checklist,
      ),
    },
  ];

  const variants = sources.map((s, i) => {
    const meta = VARIANTS[i];
    const useStored = i === 0 && storedKit;
    const asset = assets[i];
    const sourceUrl = assetUrl(asset);
    const image = useStored
      ? storedKit.image
      : sourceUrl
      ? buildPinImage({
          sourceUrl,
          hook: s.overlay,
          brandLine,
          filename: i === 0 ? pinFilename(article.id) : `${pinFilename(article.id)}-${meta.id}`,
        })
      : null;
    return {
      id: meta.id,
      order: i + 1,
      label: meta.label,
      title: useStored ? storedKit.title : s.title,
      overlay: useStored ? storedKit.hook : s.overlay,
      description: useStored ? storedKit.description : s.description,
      hashtags,
      link,
      image,
      imageSource: asset?.key || "",
      suggestedDate: addDays(now, VARIANT_OFFSET_DAYS[i]),
      reusedStoredKit: Boolean(useStored),
    };
  });

  return { variants, notes };
}

// Older published guides that should point AT this article. ATLAS never edits a
// live Blogger post: the operator copies the snippet in by hand.
export function buildInternalLinkCandidates({ article, articles = [], max = 3 } = {}) {
  const link = String(article?.publishedUrl || "").trim();
  const anchor = truncateAtWord(String(article?.keyword || article?.title || "").toLowerCase(), 70);
  const topic = (article?.topicEntities || [])[0] || article?.category || "this topic";
  return selectInternalLinks({
    keyword: article?.keyword || "",
    title: article?.title || "",
    articles,
    excludeId: article?.id || "",
    max: 12,
  })
    .filter((c) => c.score >= RELATED_MIN_SCORE)
    .slice(0, max)
    .map((c) => {
      const sentence = `For ${topic} timing rules, see ${anchor}.`;
      return {
        articleId: c.articleId,
        title: c.title,
        url: c.url,
        anchor,
        sentence,
        html: `<p>For ${topic} timing rules, see <a href="${link}">${anchor}</a>.</p>`,
      };
    });
}

// ─── Pinterest 등록(게시) 상태 ───────────────────────────────────────────────
// 홍보자료를 만든 것과 실제로 Pinterest에 올린 것은 다른 사실이다. ATLAS는
// Pinterest를 읽을 수 없으므로 사람이 직접 표시한 것만 "등록 완료"로 본다 —
// kit이 있다는 이유로 게시됐다고 추정하지 않는다.
export function emptyPosted() {
  return { question: null, mistake: null, checklist: null };
}

export function isValidPinUrl(value) {
  const url = String(value || "").trim();
  if (!url) return true; // 핀 주소는 선택 입력
  return /^https?:\/\/[^\s"'<>]+$/i.test(url);
}

export function normalizePostState(input = {}, { now = new Date() } = {}) {
  if (input?.posted === false) return { ok: true, state: null };
  if (!isValidPinUrl(input?.pinUrl)) {
    return { ok: false, error: "핀 주소는 http:// 또는 https:// 로 시작하는 주소여야 합니다." };
  }
  return {
    ok: true,
    state: {
      posted: true,
      postedAt: String(input?.postedAt || "").trim() || isoDay(now),
      pinUrl: String(input?.pinUrl || "").trim(),
    },
  };
}

// 아직 올리지 않은 다음 핀과 그 권장 등록일. 완료된 카드에서 "다음은 이것"을
// 안내하는 데 쓴다.
export function nextUnposted(variants = [], posted = {}) {
  const hit = variants.find((v) => !posted?.[v.id]?.posted);
  return hit ? { id: hit.id, order: hit.order, label: hit.label, suggestedDate: hit.suggestedDate } : null;
}

export function emptyMetrics() {
  return {
    pins: { question: null, mistake: null, checklist: null },
    google: null,
  };
}

const PIN_FIELDS = ["impressions", "saves", "pinClicks", "outboundClicks"];
const GOOGLE_FIELDS = ["impressions", "clicks"];

function cleanNumbers(input, fields) {
  if (!input || typeof input !== "object") return null;
  const out = {};
  let any = false;
  for (const f of fields) {
    const raw = input[f];
    if (raw === "" || raw === null || raw === undefined) {
      out[f] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return { error: `${f}는 0 이상의 숫자여야 합니다.` };
    out[f] = Math.round(n);
    any = true;
  }
  return any ? out : null;
}

// Validates one 7일/30일 entry. A field left blank stays null — "미입력" is not
// the same claim as 0, and this never turns one into the other.
export function normalizeMetrics(input = {}) {
  const errors = [];
  const next = emptyMetrics();
  for (const v of VARIANTS) {
    const cleaned = cleanNumbers(input?.pins?.[v.id], PIN_FIELDS);
    if (cleaned?.error) errors.push(`${v.label}: ${cleaned.error}`);
    else next.pins[v.id] = cleaned;
  }
  const g = cleanNumbers(input?.google, GOOGLE_FIELDS);
  if (g?.error) errors.push(`Google: ${g.error}`);
  else next.google = g;
  return { ok: errors.length === 0, errors, metrics: next };
}

export function normalizeSearchCheck(input = {}, { now = new Date() } = {}) {
  const status = SEARCH_STATUS.includes(input?.status) ? input.status : "unchecked";
  return {
    status,
    checkedAt: status === "unchecked" ? "" : String(input?.checkedAt || isoDay(now)),
    note: String(input?.note || "").slice(0, 500),
  };
}

export function emptyRecord(articleId) {
  return {
    articleId,
    search: { status: "unchecked", checkedAt: "", note: "" },
    posted: emptyPosted(),
    // 완료 표시와 취소는 지우지 않고 남긴다 — 무엇을 언제 올렸다고 했는지가
    // 취소 한 번으로 사라지면 중복 게시를 되짚을 수 없다.
    postLog: [],
    metrics: { day7: emptyMetrics(), day30: emptyMetrics() },
    updatedAt: "",
  };
}

// 게시 상태 필드가 없던 초기 기록도 그대로 읽을 수 있게 채워 준다.
export function withPostingDefaults(record) {
  if (!record) return null;
  return { ...record, posted: { ...emptyPosted(), ...(record.posted || {}) }, postLog: record.postLog || [] };
}

/**
 * The whole 6단계 payload for one article. `ok:false` when the article is not
 * actually published — the screen states that instead of showing pin material
 * for a post that has no public URL.
 */
export function buildTrafficKit({ article, articles = [], storedKit = null, record = null, now = new Date() } = {}) {
  if (!article) return { ok: false, reason: "글을 찾을 수 없습니다.", kit: null };
  const link = String(article.publishedUrl || "").trim();
  const isPublished = article.publishState === "published" || article.status === "published";
  if (!isPublished || !link) {
    return { ok: false, reason: "블로그 발행 후 사용할 수 있습니다.", kit: null };
  }

  const { variants: built, notes } = buildVariants({ article, storedKit, now });
  const publishedAt = article.publishedAt || article.updatedAt || null;
  const stored = withPostingDefaults(record) || emptyRecord(article.id);
  // 저장된 "등록 완료" 표시만 붙인다. 표시가 없으면 언제나 등록 전이다.
  const variants = built.map((v) => ({ ...v, posting: stored.posted[v.id] || null }));

  return {
    ok: true,
    kit: {
      articleId: article.id,
      title: article.title,
      publishedUrl: link,
      publishedAt,
      checkDates: {
        published: publishedAt ? isoDay(new Date(publishedAt)) : null,
        day7: publishedAt ? addDays(publishedAt, 7) : null,
        day30: publishedAt ? addDays(publishedAt, 30) : null,
      },
      variants,
      nextUnposted: nextUnposted(variants, stored.posted),
      internalLinks: buildInternalLinkCandidates({ article, articles }),
      notes,
    },
    record: stored,
  };
}
