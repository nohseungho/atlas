import fs from "fs";
import path from "path";
import { contentVersion, reviewContentVersion, workflowStateOf, createPublishTransactions } from "./atlas/publish-transaction.js";
import { createKoreaDocument } from "./atlas/article-document.js";

// Optional isolated data directory for local dry-run verification.
const DATA_DIR = process.env.ATLAS_DATA_DIR || path.join(process.cwd(), "data", "atlas");

function filePath(name) {
  return path.join(DATA_DIR, name);
}

export function readJson(name) {
  const raw = fs.readFileSync(filePath(name), "utf-8");
  return JSON.parse(raw);
}

// Atomic write: serialize into a temp file in the same directory, then rename it
// over the target. A crash or a concurrent reader can therefore never observe a
// truncated/half-written JSON file — only the old or the new content. Publisher
// state (postId / publishedUrl / publishState) lives in these files, so a torn
// write would mean losing the record of a post that is already public.
export function writeJson(name, data) {
  const target = filePath(name);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  if (["articles.json", "korea-drafts.json"].includes(name)) {
    const field = name === "articles.json" ? "articles" : "items";
    const prior = readJson(name)[field] || [];
    for (const record of data[field] || []) {
      const old = prior.find((item) => item.id === record.id);
      if (old && JSON.stringify(old) === JSON.stringify(record)) continue;
      if (old && contentVersion(old) !== contentVersion(record)) {
        if (old.state === "publishing" || old.publishState === "publishing" || createPublishTransactions().read(field === "items" ? "korea" : "global", old.id)?.state === "PUBLISHING") throw new Error("게시 중인 글은 수정할 수 없습니다.");
        if (reviewContentVersion(old) !== reviewContentVersion(record)) record.finalReview = null;
        record.userPublishApproval = null;
        if (!record.publishedUrl) {
          if (field === "items") record.state = "ready_for_review";
          else record.publishState = "written";
        }
      }
      record.workflowState = workflowStateOf(record);
      if (field === "items" && !record.publishedUrl && record.bodyText) record.articleDocument = createKoreaDocument(record);
    }
  }
  const serialized = `${JSON.stringify(data, null, 2)}\n`;

  fs.writeFileSync(tmp, serialized, "utf-8");
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // temp file cleanup is best-effort; the rename failure is what matters
    }
    throw err;
  }
}
