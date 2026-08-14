import { readJson, writeJson } from "@/lib/data-store";
import { suggestSlug, nextArticleId } from "@/lib/atlas/article-factory";
import { nextJobId } from "@/lib/atlas/job-identity";

const FILE = "production-jobs.json";
// pipeline.json numbers its own jobs with the same pjob_ prefix, so the next id
// is taken from the union of both stores — otherwise two unrelated jobs end up
// sharing a number the UI presents as one.
const SHARED_NAMESPACE_FILES = ["pipeline.json"];

export function getProductionData() {
  const data = readJson(FILE);
  data.jobs = data.jobs || [];
  return data;
}

export function saveProductionData(data) {
  writeJson(FILE, data);
}

// Every pjob id on record, including the stores this file does not own. A
// missing/unreadable neighbour file must not stop a job from being created, but
// it must not silently lower the ceiling either — so it contributes nothing and
// the ids this file already knows about still apply.
export function usedJobIds() {
  const sources = [getProductionData().jobs];
  for (const file of SHARED_NAMESPACE_FILES) {
    try {
      sources.push(readJson(file).jobs || []);
    } catch {
      // neighbour store absent — this store's own ids remain authoritative
    }
  }
  return sources;
}

function allocateJobId() {
  return nextJobId(...usedJobIds());
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

// `idempotencyKey` lets a caller claim its own identity namespace. The manual
// ChatGPT request passes one so that it never adopts an unrelated job that
// happens to share a topic; without it the topic slug is the key, which is what
// the automatic pipeline still dedupes on.
export function createProductionJob({ recommendation, idempotencyKey: requestedKey } = {}) {
  const data = getProductionData();
  const idempotencyKey = requestedKey || suggestSlug(recommendation?.title || recommendation?.topic || "");
  const existing = findLiveJobByKey(idempotencyKey);
  if (existing) return { job: existing, duplicate: true };

  const now = new Date().toISOString();
  const job = {
    id: allocateJobId(),
    idempotencyKey,
    topic: recommendation?.title || recommendation?.topic || "",
    searchIntent: recommendation?.searchIntent || "",
    // Cards refilled from keywords.json carry their Money Hunter id — recording it
    // here is what marks kw_0xx as spent for the next recommendation batch.
    moneyHunterId: recommendation?.moneyHunterId || "",
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
