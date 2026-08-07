import { readJson, writeJson } from "@/lib/data-store";

const FILE = "publishing.json";

function nextId(items, prefix) {
  const pattern = new RegExp(`^${prefix}_(\\d+)$`);
  const maxNum = items.reduce((max, item) => {
    const match = pattern.exec(item.id || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}_${String(maxNum + 1).padStart(3, "0")}`;
}

export function getPublishingData() {
  return readJson(FILE);
}

export function savePublishingData(data) {
  writeJson(FILE, data);
}

// article x channel 조합 1건 = PublishJob 1건. 하나의 article이 여러 channel(blog)에
// 발행되면 job도 여러 건 생긴다. 기존처럼 articleId 기준으로 덮어쓰지 않는다.
export function createPublishJob({ articleId, channelId, provider, maxAttempts = 3 }) {
  const data = getPublishingData();
  const now = new Date().toISOString();

  const job = {
    id: nextId(data.jobs, "job"),
    articleId,
    channelId,
    provider,
    status: "queued",
    attemptCount: 0,
    maxAttempts,
    lastError: null,
    nextRetryAt: null,
    createdAt: now,
    updatedAt: now,
    publishedUrl: "",
    externalId: "",
  };

  data.jobs.push(job);
  savePublishingData(data);

  appendPublishHistory({
    jobId: job.id,
    articleId,
    channelId,
    provider,
    status: job.status,
    message: "Job 생성",
  });

  return job;
}

export function updatePublishJobStatus(jobId, updates = {}) {
  const data = getPublishingData();
  const job = data.jobs.find((item) => item.id === jobId);

  if (!job) {
    throw new Error(`publish job not found: ${jobId}`);
  }

  if (updates.status) job.status = updates.status;
  if (typeof updates.publishedUrl === "string") job.publishedUrl = updates.publishedUrl;
  if (typeof updates.externalId === "string") job.externalId = updates.externalId;
  if (typeof updates.lastError !== "undefined") job.lastError = updates.lastError;
  if (typeof updates.nextRetryAt !== "undefined") job.nextRetryAt = updates.nextRetryAt;
  if (updates.incrementAttempt) job.attemptCount += 1;
  job.updatedAt = new Date().toISOString();

  savePublishingData(data);

  appendPublishHistory({
    jobId: job.id,
    articleId: job.articleId,
    channelId: job.channelId,
    provider: job.provider,
    status: job.status,
    message: updates.message || `상태 변경: ${job.status}`,
    error: updates.lastError || null,
  });

  return job;
}

// history는 append-only. job 상태가 바뀔 때마다 쌓이며, 절대 기존 항목을 덮어쓰지 않는다.
export function appendPublishHistory({
  jobId,
  articleId,
  channelId,
  provider,
  status,
  message,
  error,
}) {
  const data = getPublishingData();

  const entry = {
    id: nextId(data.history, "hist"),
    jobId,
    articleId,
    channelId,
    provider,
    status,
    message: message || "",
    error: error || null,
    createdAt: new Date().toISOString(),
  };

  data.history.push(entry);
  savePublishingData(data);

  return entry;
}

// Marks an already-succeeded job with an image-sync result, without touching
// job.status or appending a new history entry. Cloudinary Image Automation
// Sprint reuses the existing succeeded publish job as the record of "this
// article's live Blogger post" — this only records that the post's images
// were refreshed, it never creates a new job or a duplicate "succeeded" entry.
export function markJobImageSync(jobId, { status, message = "" }) {
  const data = getPublishingData();
  const job = data.jobs.find((item) => item.id === jobId);
  if (!job) return null;

  job.imageSync = { status, message, syncedAt: new Date().toISOString() };
  job.updatedAt = new Date().toISOString();
  savePublishingData(data);
  return job;
}

export function getJobsByArticleId(articleId) {
  return getPublishingData().jobs.filter((job) => job.articleId === articleId);
}

export function getJobsByStatus(status) {
  return getPublishingData().jobs.filter((job) => job.status === status);
}
