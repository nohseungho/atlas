import { readJson, writeJson } from "@/lib/data-store";
import { suggestSlug, nextArticleId } from "@/lib/atlas/article-factory";

const FILE = "production-jobs.json";

export function getProductionData() {
  const data = readJson(FILE);
  data.jobs = data.jobs || [];
  return data;
}

export function saveProductionData(data) {
  writeJson(FILE, data);
}

function nextJobId(jobs) {
  const max = jobs.reduce((m, j) => {
    const match = /^pjob_(\d+)$/.exec(j.id || "");
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `pjob_${String(max + 1).padStart(3, "0")}`;
}

export function listProductionJobs() {
  return getProductionData().jobs;
}

export function getProductionJob(id) {
  return getProductionData().jobs.find((j) => j.id === id) || null;
}

// Idempotency: one live job per topic slug. A duplicate click returns the
// existing job instead of creating a second one (unless the prior one FAILED).
export function findLiveJobByKey(idempotencyKey) {
  return getProductionData().jobs.find(
    (j) => j.idempotencyKey === idempotencyKey && j.status !== "FAILED",
  ) || null;
}

export function createProductionJob({ recommendation }) {
  const data = getProductionData();
  const idempotencyKey = suggestSlug(recommendation?.title || recommendation?.topic || "");
  const existing = findLiveJobByKey(idempotencyKey);
  if (existing) return { job: existing, duplicate: true };

  const now = new Date().toISOString();
  const job = {
    id: nextJobId(data.jobs),
    idempotencyKey,
    topic: recommendation?.title || recommendation?.topic || "",
    searchIntent: recommendation?.searchIntent || "",
    axis: recommendation?.contentAxis?.id || recommendation?.axis || "",
    recommendation,
    articleId: "",
    status: "QUEUED",
    step: "QUEUED",
    progress: { index: 0, total: 8, percent: 0 },
    steps: {},
    blocked: null,
    error: null,
    review: null,
    preview: null,
    bloggerDraft: null,
    createdAt: now,
    startedAt: null,
    updatedAt: now,
  };
  data.jobs.push(job);
  saveProductionData(data);
  return { job, duplicate: false };
}

export function updateProductionJob(id, mutate) {
  const data = getProductionData();
  const job = data.jobs.find((j) => j.id === id);
  if (!job) throw new Error(`production job not found: ${id}`);
  mutate(job);
  job.updatedAt = new Date().toISOString();
  saveProductionData(data);
  return job;
}

// Reserve the next article id from the live articles.json at commit time, so
// two jobs can never collide (id is only taken when the article is actually
// written after VALIDATING passes).
export function reserveArticleId() {
  const articles = readJson("articles.json").articles || [];
  return nextArticleId(articles);
}
