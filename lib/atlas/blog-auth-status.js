// Cross-page signal for "this blog's Blogger auth needs reconnecting".
// Client-only (localStorage). No new backend/OAuth/DB structure — this just
// remembers the auth_required response that /api/publish already returns,
// so Blog Manager can show it after Publisher sees it.

const STORAGE_KEY = "atlas_blog_auth_issues";

function readIssues() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeIssues(issues) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(issues));
}

export function flagAuthIssue(blogId, message) {
  if (!blogId) return;
  const issues = readIssues();
  issues[blogId] = { message: message || "", detectedAt: new Date().toISOString() };
  writeIssues(issues);
}

export function clearAuthIssue(blogId) {
  if (!blogId) return;
  const issues = readIssues();
  if (issues[blogId]) {
    delete issues[blogId];
    writeIssues(issues);
  }
}

export function getAuthIssues() {
  return readIssues();
}
