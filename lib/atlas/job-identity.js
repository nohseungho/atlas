// Job identity — how a pjob id is allocated and what a manual request is keyed
// on. Pure (no IO), so both rules are unit-testable without a data file.
//
// Two things went wrong once these were left implicit:
//   • production-jobs.json and pipeline.json each numbered from their OWN file,
//     so both stores minted pjob_001…pjob_007 for seven completely different
//     jobs. A number shown to the user as "Job pjob_007" has to mean one job.
//   • A manual ChatGPT request was deduped on the topic slug, so a new request
//     adopted whatever job already carried that title — a fresh Trip
//     Cancellation request came back as pjob_001, a research-blocked automation
//     job from July.

export const JOB_ID_PATTERN = /^pjob_(\d+)$/;

// Highest pjob number on record. Accepts job objects or bare id strings, and
// ignores anything that is not a pjob id.
export function maxJobNumber(...idSources) {
  let max = 0;
  for (const source of idSources) {
    for (const entry of source || []) {
      const match = JOB_ID_PATTERN.exec(String(entry?.id ?? entry ?? ""));
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return max;
}

// Next free pjob id across EVERY store that shares the namespace. Callers pass
// each store's records; an id already used anywhere is never handed out again.
export function nextJobId(...idSources) {
  return `pjob_${String(maxJobNumber(...idSources) + 1).padStart(3, "0")}`;
}

// A manual request is identified by (blog + candidate), never by the topic text.
// Re-clicking the same card yields the same key — and therefore the same job —
// while a card that merely shares a title with another flow's job gets its own.
export function handoffRequestKey({ blogId, candidateId } = {}) {
  const blog = String(blogId || "").trim();
  const candidate = String(candidateId || "").trim();
  if (!blog || !candidate) return "";
  return `handoff:${blog}:${candidate}`;
}
