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

export function writeJson(name, data) {
  fs.writeFileSync(filePath(name), `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}
