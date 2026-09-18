import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runNaverBrowserJob } from "../lib/atlas/naver-browser-publisher.js";
import { canPublishKoreaDraft, publishBlockers, validateKoreaDraft } from "../lib/atlas/korea-product-pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const file = path.join(root, "data", "atlas", "korea-drafts.json");
const mode = process.argv[2] === "publish" ? "publish" : "stage";
const id = String(process.argv[3] || "").trim();

function cleanXmlValue(value = "") {
  return String(value)
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function normalizeTitle(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

async function getNaverRssPosts(blogId) {
  const url = `https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": "ATLAS-Naver-Duplicate-Guard/1.0",
        "cache-control": "no-cache",
      },
    });
  } catch (cause) {
    const error = new Error("네이버 RSS 중복 검사에 연결하지 못했습니다. 안전을 위해 발행을 중단합니다.");
    error.code = "NAVER_DUPLICATE_CHECK_FAILED";
    error.cause = cause;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`네이버 RSS 중복 검사 실패 HTTP ${response.status}. 안전을 위해 발행을 중단합니다.`);
    error.code = "NAVER_DUPLICATE_CHECK_FAILED";
    throw error;
  }

  const xml = await response.text();
  const posts = [];

  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = match[1];

    const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);
    const dateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

    const title = cleanXmlValue(titleMatch?.[1] || "");
    const link = cleanXmlValue(linkMatch?.[1] || "");
    const pubDate = cleanXmlValue(dateMatch?.[1] || "");

    if (title && link) posts.push({ title, link, pubDate });
  }

  return posts;
}

function markDraftPublished(data, draft, post) {
  const target = data.items.find((item) => item.id === draft.id);
  if (!target) return;

  const parsedDate = post.pubDate ? new Date(post.pubDate) : null;
  const publishedAt =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toISOString()
      : new Date().toISOString();

  target.state = "published";
  target.automationStatus = "published";
  target.publishedAt = publishedAt;
  target.publishedUrl = post.link;
  target.lastError = "";
  target.updatedAt = new Date().toISOString();

  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const items = Array.isArray(data.items) ? data.items : [];

const draft = id
  ? items.find((item) => item.id === id)
  : items.find((item) =>
      item.state === (mode === "publish" ? "approved" : "ready_for_review")
    );

if (!draft) {
  console.error(
    mode === "publish"
      ? "발행 승인된 국내 글이 없습니다."
      : "검수 대기 중인 국내 글이 없습니다."
  );
  process.exit(2);
}

const validation = validateKoreaDraft(draft);
if (!validation.ok) {
  console.error(`국내 글 검증 실패: ${validation.issues.join(", ")}`);
  process.exit(3);
}

if (mode === "publish" && !canPublishKoreaDraft(draft)) {
  console.error("최종 발행 승인 상태가 아니므로 실제 네이버 발행을 차단했습니다.");
  process.exit(4);
}

const blockers = mode === "publish" ? publishBlockers(draft) : [];
if (blockers.length) {
  console.error(`수익화 조건 미충족으로 실제 네이버 발행을 차단했습니다: ${blockers.join(", ")}`);
  process.exit(5);
}

try {
  if (mode === "publish") {
    const livePosts = await getNaverRssPosts(draft.blogId);
    const wantedTitle = normalizeTitle(draft.title);

    const duplicate = livePosts.find(
      (post) => normalizeTitle(post.title) === wantedTitle
    );

    if (duplicate) {
      markDraftPublished(data, draft, duplicate);

      console.log(
        JSON.stringify(
          {
            id: draft.id,
            mode,
            status: "duplicate_blocked",
            errorCode: "NAVER_DUPLICATE_BLOCKED",
            message: "동일 제목의 공개 글이 이미 존재하여 신규 발행을 차단했습니다.",
            existingTitle: duplicate.title,
            existingUrl: duplicate.link,
            existingPubDate: duplicate.pubDate,
          },
          null,
          2
        )
      );

      process.exit(0);
    }
  }

  const result = await runNaverBrowserJob(draft, {
    publish: mode === "publish",
  });

  console.log(
    JSON.stringify(
      {
        id: draft.id,
        mode,
        ...result,
      },
      null,
      2
    )
  );

  if (result.status === "login_required") process.exitCode = 5;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        id: draft.id,
        mode,
        status: "failed",
        errorCode: error?.code || "NAVER_AUTOMATION_FAILED",
        error: String(error?.message || error),
      },
      null,
      2
    )
  );
  process.exit(1);
}