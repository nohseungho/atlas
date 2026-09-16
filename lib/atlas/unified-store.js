import fs from "node:fs";
import path from "node:path";
import { migrateResults } from "./unified-workflow.js";
const dir = () => path.join(process.cwd(), ".atlas-data", "unified");
export function readUnified() {
  try { return migrateResults(JSON.parse(fs.readFileSync(path.join(dir(), "state.json"), "utf8"))); }
  catch (e) { if (e.code !== "ENOENT") throw e; return { channels: {}, drafts: {} }; }
}
// Cross-process lock; never clear a crash lock automatically during a publish.
export async function mutateUnified(fn) {
  fs.mkdirSync(dir(), { recursive: true });
  const lock = path.join(dir(), "write.lock");
  let fd;
  try { fd = fs.openSync(lock, "wx"); } catch { throw new Error("다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요."); }
  try {
    const state = readUnified();
    const pending = fn(state);
    const result = pending instanceof Promise ? await pending : pending;
    const temp = path.join(dir(), `state.${process.pid}.tmp`);
    fs.writeFileSync(temp, JSON.stringify(state, null, 2));
    fs.renameSync(temp, path.join(dir(), "state.json"));
    return result;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
