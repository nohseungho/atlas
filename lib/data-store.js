import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "atlas");

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
