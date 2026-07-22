import { readJson, writeJson } from "@/lib/data-store";

const FILE = "pipeline.json";

function nextId(items, prefix) {
  const pattern = new RegExp(`^${prefix}_(\\d+)$`);
  const maxNum = (items || []).reduce((max, item) => {
    const match = pattern.exec(item.id || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}_${String(maxNum + 1).padStart(3, "0")}`;
}

export function getPipelineData() {
  const data = readJson(FILE);
  data.batches = data.batches || [];
  data.jobs = data.jobs || [];
  return data;
}

export function savePipelineData(data) {
  writeJson(FILE, data);
}

// Persist a generated recommendation set so selection can reference it later.
export function saveRecommendationBatch(result) {
  const data = getPipelineData();
  const batch = { id: nextId(data.batches, "batch"), ...result };
  data.batches.push(batch);
  // Keep only the most recent 10 batches to avoid unbounded growth.
  data.batches = data.batches.slice(-10);
  savePipelineData(data);
  return batch;
}

export function getLatestBatch() {
  const data = getPipelineData();
  return data.batches[data.batches.length - 1] || null;
}

// Create a pipeline job. When linkedArticleId is provided (Factory MASTER path)
// the job starts at "qa" — machine research/draft are skipped by a real article.
export function createPipelineJob({ topic, type, linkedArticleId = "", recommendation = null }) {
  const data = getPipelineData();
  const now = new Date().toISOString();
  const job = {
    id: nextId(data.jobs, "pjob"),
    topic: topic || recommendation?.topic || "",
    type: type || recommendation?.type || "",
    stage: linkedArticleId ? "qa" : "recommendation",
    linkedArticleId,
    recommendation,
    humanApproved: false,
    imagesReady: false,
    history: [{ stage: linkedArticleId ? "qa" : "recommendation", at: now, note: "job 생성" }],
    createdAt: now,
    updatedAt: now,
  };
  data.jobs.push(job);
  savePipelineData(data);
  return job;
}

export function updatePipelineJob(jobId, updates = {}, note = "") {
  const data = getPipelineData();
  const job = data.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error(`pipeline job not found: ${jobId}`);
  const now = new Date().toISOString();

  if (updates.stage && updates.stage !== job.stage) {
    job.stage = updates.stage;
    job.history.push({ stage: updates.stage, at: now, note: note || "단계 이동" });
  }
  if (typeof updates.linkedArticleId === "string") job.linkedArticleId = updates.linkedArticleId;
  if (typeof updates.humanApproved === "boolean") job.humanApproved = updates.humanApproved;
  if (typeof updates.imagesReady === "boolean") job.imagesReady = updates.imagesReady;
  job.updatedAt = now;

  savePipelineData(data);
  return job;
}

export function getPipelineJob(jobId) {
  return getPipelineData().jobs.find((j) => j.id === jobId) || null;
}

export function listPipelineJobs() {
  return getPipelineData().jobs;
}
