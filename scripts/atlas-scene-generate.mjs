// ATLAS 장면 아트 로컬 생성기 — 유료 API를 쓰지 않는다.
//
//   node scripts/atlas-scene-generate.mjs <korea|global> <topicSlug> [--roles a,b] [--seed-base N] [--comfy URL]
//
// 초안(korea-drafts.json / articles.json)에 이미 들어 있는 장면 요청 프롬프트를 읽어
// 로컬 ComfyUI로 생성하고, scene-art.js가 찾는 자리(public/atlas/<channel>/<character>/<topic>/<role>.png)에
// 떨어뜨린다. 초안 연결은 기존 운영 화면의 "이미지 생성" 단계(action=images)가 그대로 한다.
// 공개된 글의 주제는 건드리지 않는다.
import fs from "fs";
import path from "path";
import { artDirFor } from "../lib/atlas/operate/scene-art.js";
import { directionFor } from "../lib/atlas/operate/scene-direction.js";
import { GENERATOR, buildWorkflow, channelProfile, generationPrompt, referenceAssets, seedFor } from "../lib/atlas/operate/scene-generator.js";

const args = process.argv.slice(2);
const channel = args[0];
const topicSlug = args[1];
const opt = (name, fallback = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const COMFY = opt("comfy", "http://127.0.0.1:8188");
const SEED_BASE = Number(opt("seed-base", "0"));
const ONLY = opt("roles") ? opt("roles").split(",") : null;

function readData(file) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "atlas", file), "utf8"));
}

// 생성할 역할과 요청 프롬프트. 공개된 글이면 멈춘다.
function requestItems() {
  if (channel === "korea") {
    const draft = (readData("korea-drafts.json").items || []).find((d) => d.topicId === `kr_info_${topicSlug}`);
    if (!draft) throw new Error(`국내 초안이 없습니다: kr_info_${topicSlug}`);
    if (draft.status === "published" || draft.naverUrl || draft.logNo) throw new Error(`이미 공개된 글입니다: ${draft.id}`);
    return (draft.images || []).filter((img) => img.role !== "product_photo").map((img) => ({ role: img.role, prompt: img.prompt }));
  }
  if (channel === "global") {
    const article = (readData("articles.json").articles || []).find((a) => a.topicId === `gl_info_${topicSlug}`);
    if (!article) throw new Error(`해외 원고가 없습니다: gl_info_${topicSlug}`);
    if (article.status === "published" || article.bloggerUrl || article.publishedUrl) throw new Error(`이미 공개된 글입니다: ${article.id}`);
    return (article.visualAssets || []).map((a) => ({ role: a.role || a.key, prompt: a.prompt }));
  }
  throw new Error("채널은 korea 또는 global 입니다.");
}

async function comfy(pathname, init) {
  const res = await fetch(`${COMFY}${pathname}`, init);
  if (!res.ok) throw new Error(`ComfyUI ${pathname} ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res;
}

async function uploadReference(file) {
  const form = new FormData();
  const name = `atlas-ref-${path.basename(path.dirname(file))}-${path.basename(file)}`;
  form.append("image", new Blob([fs.readFileSync(file)], { type: "image/png" }), name);
  form.append("overwrite", "true");
  const json = await (await comfy("/upload/image", { method: "POST", body: form })).json();
  return json.name;
}

async function waitForOutput(promptId) {
  for (let i = 0; i < 600; i += 1) {
    const history = await (await comfy(`/history/${promptId}`)).json();
    const entry = history[promptId];
    if (entry?.status?.status_str === "error") throw new Error(`생성 실패: ${JSON.stringify(entry.status.messages).slice(0, 400)}`);
    const images = entry?.outputs?.save?.images;
    if (images?.length) return images[0];
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("생성 시간 초과");
}

async function main() {
  const profile = channelProfile(channel);
  const items = requestItems().filter((item) => !ONLY || ONLY.includes(item.role));
  if (!items.length) throw new Error("생성할 역할이 없습니다.");

  await comfy("/system_stats");
  const refs = referenceAssets(channel).map((p) => path.join(process.cwd(), p));
  const referenceNames = [];
  for (const ref of refs) referenceNames.push(await uploadReference(ref));

  const outDir = artDirFor(channel, topicSlug);
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(process.cwd(), "data", "atlas", "scene-art", `${channel}-${topicSlug}.json`);
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { channel, topicSlug, items: {} };

  for (const item of items) {
    const prompt = generationPrompt(channel, item.prompt, directionFor(channel, item.role));
    const seed = seedFor(channel, topicSlug, item.role, SEED_BASE);
    const workflow = buildWorkflow({ channel, prompt, seed, referenceNames, direction: directionFor(channel, item.role), prefix: `atlas-${channel}-${topicSlug}-${item.role}` });
    const { prompt_id: promptId } = await (await comfy("/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
    })).json();
    const out = await waitForOutput(promptId);
    const query = new URLSearchParams({ filename: out.filename, subfolder: out.subfolder || "", type: out.type || "output" });
    const buffer = Buffer.from(await (await comfy(`/view?${query}`)).arrayBuffer());
    const file = path.join(outDir, `${item.role}.png`);
    fs.writeFileSync(file, buffer);
    manifest.items[item.role] = {
      file: path.relative(process.cwd(), file).split(path.sep).join("/"),
      character: profile.characterId,
      direction: directionFor(channel, item.role),
      prompt,
      seed,
      negative: workflow.neg.inputs.text,
      references: referenceAssets(channel),
      ipAdapterWeight: profile.ipWeight,
      generator: { tool: "ComfyUI (local)", ...GENERATOR },
      generatedAt: new Date().toISOString(),
    };
    console.log(`${item.role}: ${manifest.items[item.role].file} (seed ${seed}, ${buffer.length} bytes)`);
  }

  manifest.character = profile.characterId;
  manifest.dropDirectory = path.relative(process.cwd(), outDir).split(path.sep).join("/");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`manifest: ${path.relative(process.cwd(), manifestPath)}`);
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
