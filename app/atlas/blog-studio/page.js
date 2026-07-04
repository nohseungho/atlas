"use client";

import { useEffect, useState } from "react";
import { KEYS, newId, readList, writeList } from "@/app/atlas/lib/storage";
import {
  buildMysteryBlackFilePrompt,
  buildOutdoorSafetyFilePrompt,
} from "@/app/atlas/shorts-studio/page";

const CATEGORIES = ["Outdoor Safety", "Mystery", "History", "Nature"];
const STATUSES = ["Draft", "Review", "Approved"];

// Blog DNA: 본문(body)은 기존과 동일한 단일 텍스트 필드에 저장하되,
// 아래 마크다운 컨벤션(## 섹션, >>> 콜아웃, ### 상품)으로 구조를 인식해 미리보기에서 고정 순서로 렌더링한다.
// 데이터 스키마는 전혀 바뀌지 않는다 (새 필드 없음).
const BLOG_DNA_SECTIONS = [
  "Quick Answer",
  "Reader Promise",
  "Problem",
  "Situation",
  "Evidence",
  "Solution",
  "Checklist",
  "Problem Reminder",
  "Recommended Gear",
  "FAQ",
  "Sources",
  "Related Articles",
  "Shorts",
  "CTA",
];

const BLOG_DNA_TEMPLATE = `## Quick Answer
(한 줄로 핵심 답을 먼저 제시하세요 — 모바일 첫 화면 안에 보여야 합니다)

## Reader Promise
(이 글을 끝까지 읽으면 무엇을 얻는지 한 줄로)

## Problem
(문제 제기)

## Situation
(실제 상황 서술)

## Evidence
(근거/팩트)

>>> SAFETY FACT: (짧은 안전 팩트 한 줄)

>>> COMMON MISTAKE: (흔한 실수 한 줄)

>>> DID YOU KNOW: (짧은 흥미 팩트 한 줄)

## Solution
(해결 방향)

## Checklist
- 항목 1
- 항목 2
- 항목 3

## Shorts
URL: (60초 영상 URL — 없으면 비워두세요)
Caption: (한 줄 유도 문구, 예: Watch before you go.)

## Problem Reminder
(제품을 보기 전 문제를 한 줄로 다시 상기시키는 문장)

## Recommended Gear
### 상품명1
Why it matters: ...
Best for: ...
Expected Use: 태그1, 태그2, 태그3

## FAQ
Q: 질문1
A: 답변1

## Sources
출처명1
출처1에 대한 한 줄 설명
출처명2
출처2에 대한 한 줄 설명

## Related Articles
관련 글 제목1
관련 글1에 대한 한 줄 설명
관련 글 제목2
관련 글2에 대한 한 줄 설명
관련 글 제목3
관련 글3에 대한 한 줄 설명
`;

export function parseBlogDNASections(body) {
  const sections = {};
  if (!body) return sections;
  let current = null;
  let buffer = [];
  const flush = () => {
    if (current) sections[current] = buffer.join("\n").trim();
    buffer = [];
  };
  for (const line of body.split("\n")) {
    const match = /^##\s+(.+)$/.exec(line.trim());
    if (match) {
      flush();
      const heading = match[1].trim();
      current = BLOG_DNA_SECTIONS.find((s) => s.toLowerCase() === heading.toLowerCase()) || null;
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();
  return sections;
}

function parseCallouts(body, label) {
  if (!body) return [];
  const re = new RegExp(`^>>>\\s*${label}\\s*:\\s*(.+)$`, "i");
  return body
    .split("\n")
    .map((line) => re.exec(line.trim()))
    .filter(Boolean)
    .map((m) => m[1].trim());
}

function parseBulletList(text) {
  if (!text) return [];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("-"))
    .map((l) => l.replace(/^-+\s*/, "").trim())
    .filter(Boolean);
}

export function parseFaqPairs(text) {
  if (!text) return [];
  const pairs = [];
  let currentQ = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const qMatch = /^Q[:.]\s*(.+)$/i.exec(line);
    const aMatch = /^A[:.]\s*(.+)$/i.exec(line);
    if (qMatch) {
      currentQ = qMatch[1].trim();
    } else if (aMatch && currentQ) {
      pairs.push({ q: currentQ, a: aMatch[1].trim() });
      currentQ = null;
    }
  }
  return pairs;
}

function parseRecommendedGearFromBody(text) {
  if (!text) return [];
  const blocks = text.split(/^###\s+/m).slice(1);
  return blocks.map((block) => {
    const lines = block.split("\n");
    const name = lines[0].trim();
    const rest = lines.slice(1).join("\n");
    const why = /Why it matters:\s*(.+)/i.exec(rest)?.[1]?.trim() || "";
    const bestFor = /Best for:\s*(.+)/i.exec(rest)?.[1]?.trim() || "";
    const expectedUseRaw = /Expected Use:\s*(.+)/i.exec(rest)?.[1]?.trim() || "";
    const expectedUse = expectedUseRaw
      ? expectedUseRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    return { name, why, bestFor, expectedUse };
  });
}

// 저자가 "Name / 한 줄 설명"을 두 줄씩 짝지어 쓰면 설명까지 파싱하고,
// 기존 방식대로 "- 항목" 한 줄 불릿만 써도 그대로 동작한다 (하위 호환).
function parsePairedEntries(text) {
  if (!text) return [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const hasBullets = lines.some((l) => l.startsWith("-"));
  if (hasBullets) {
    return lines
      .filter((l) => l.startsWith("-"))
      .map((l) => ({ name: l.replace(/^-+\s*/, "").trim(), description: "" }));
  }
  const entries = [];
  for (let i = 0; i < lines.length; i += 2) {
    entries.push({ name: lines[i], description: lines[i + 1] || "" });
  }
  return entries;
}

function parseShortsInfo(text) {
  if (!text) return { url: "", caption: "" };
  const url = /URL:\s*(.+)/i.exec(text)?.[1]?.trim() || "";
  const caption = /Caption:\s*(.+)/i.exec(text)?.[1]?.trim() || "";
  if (!url && !caption) {
    // URL:/Caption: 컨벤션을 안 쓰고 그냥 한 줄만 썼다면 URL로 취급 (하위 호환)
    return { url: text.trim(), caption: "" };
  }
  return { url, caption };
}

const emptyForm = {
  topic: "",
  category: CATEGORIES[0],
  body: "",
  metaDescription: "",
  slug: "",
  productIds: [],
  imagePrompts: [],
  status: "Draft",
};

// Production Pipeline: 기존 슬러그와 겹치지 않도록 -copy, -copy-2 ... 로 기계적으로 생성한다 (AI 아님).
function generateUniqueSlug(baseSlug, existingSlugs) {
  const base = (baseSlug || "untitled").replace(/\/$/, "");
  let candidate = `${base}-copy`;
  let n = 2;
  while (existingSlugs.includes(candidate)) {
    candidate = `${base}-copy-${n}`;
    n += 1;
  }
  return candidate;
}

// Image Prompt 6장을 보장한다. 원본에 6장 미만이면 6가지 고정 역할(Situation/Real Scene/
// Map·Checklist/Gear in Use/Comparison/Closing) 이름으로 템플릿 프롬프트를 채운다 (AI 생성 아님).
function ensureSixImagePrompts(sourcePrompts, topic) {
  const roles = ["Situation", "Real Scene", "Map / Checklist", "Gear in Use", "Comparison", "Closing"];
  const result = [...sourcePrompts];
  for (let i = result.length; i < 6; i += 1) {
    result.push(
      `Realistic documentary-style photograph representing "${roles[i]}" for "${topic}", natural lighting, high detail, no text, no watermark.`
    );
  }
  return result.slice(0, 6);
}

export default function BlogStudioPage() {
  const [drafts, setDrafts] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [imagePromptInput, setImagePromptInput] = useState("");
  const [generateSourceId, setGenerateSourceId] = useState("");
  const [generateResult, setGenerateResult] = useState(null);

  useEffect(() => {
    setDrafts(readList(KEYS.blogDrafts));
    setProducts(readList(KEYS.products));
  }, []);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleProduct(productId) {
    setForm((prev) => {
      const has = prev.productIds.includes(productId);
      return {
        ...prev,
        productIds: has
          ? prev.productIds.filter((id) => id !== productId)
          : [...prev.productIds, productId],
      };
    });
  }

  function addImagePrompt() {
    if (!imagePromptInput.trim()) return;
    setForm((prev) => ({
      ...prev,
      imagePrompts: [...prev.imagePrompts, imagePromptInput.trim()],
    }));
    setImagePromptInput("");
  }

  function removeImagePrompt(index) {
    setForm((prev) => ({
      ...prev,
      imagePrompts: prev.imagePrompts.filter((_, i) => i !== index),
    }));
  }

  function persist(status) {
    const draft = {
      id: editingId || newId("blog"),
      ...form,
      status,
      updatedAt: new Date().toISOString(),
    };
    const next = editingId
      ? drafts.map((d) => (d.id === editingId ? draft : d))
      : [draft, ...drafts];
    setDrafts(next);
    writeList(KEYS.blogDrafts, next);
    setEditingId(draft.id);
    setForm((prev) => ({ ...prev, status }));
  }

  function handleLoadDraft(draft) {
    setEditingId(draft.id);
    setForm({
      topic: draft.topic,
      category: draft.category,
      body: draft.body,
      metaDescription: draft.metaDescription,
      slug: draft.slug,
      productIds: draft.productIds || [],
      imagePrompts: draft.imagePrompts || [],
      status: draft.status,
    });
  }

  function handleNewDraft() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function handleDeleteDraft(id) {
    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next);
    writeList(KEYS.blogDrafts, next);
    if (editingId === id) handleNewDraft();
  }

  function insertBlogDNATemplate() {
    if (form.body.trim()) {
      const confirmed = window.confirm(
        "본문을 Blog DNA 템플릿으로 덮어씁니다. 기존 내용은 사라집니다. 계속할까요?"
      );
      if (!confirmed) return;
    }
    updateField("body", BLOG_DNA_TEMPLATE);
  }

  // Production Pipeline: MASTER 선택 → Duplicate → Title/Slug/SEO Meta/Product/Image Prompt
  // 자동 채움 → Draft 저장(Publishing Center에 자동 노출) → Shorts Prompt 자동 생성(Video Library에 메모로 등록)
  // 새 API/DB/필드 없이 기존 blogDrafts·products·videoLibrary 구조만 그대로 재사용한다.
  function handleGenerate() {
    const source = drafts.find((d) => d.id === generateSourceId);
    if (!source) return;

    const existingSlugs = drafts.map((d) => d.slug).filter(Boolean);
    const newSlug = generateUniqueSlug(source.slug, existingSlugs);
    const newTopic = `${source.topic} (Copy)`;
    const newImagePrompts = ensureSixImagePrompts(source.imagePrompts || [], newTopic);

    const newDraft = {
      id: newId("blog"),
      topic: newTopic, // Title 생성 (SEO Meta Title도 동일 필드를 재사용 — 별도 필드 없음)
      category: source.category,
      body: source.body, // FAQ / Sources / Checklist 등 본문 섹션 그대로 승계
      metaDescription: source.metaDescription, // SEO Meta Description 생성
      slug: newSlug, // Slug 생성
      productIds: [...(source.productIds || [])], // Product 자동 연결
      imagePrompts: newImagePrompts, // Image Prompt 6개 생성
      status: "Draft", // Draft 생성 (승인 전 상태 유지, 임의 자동승인 안 함)
      updatedAt: new Date().toISOString(),
    };

    const nextDrafts = [newDraft, ...drafts];
    setDrafts(nextDrafts);
    writeList(KEYS.blogDrafts, nextDrafts);

    // Keywords 생성: 별도 필드를 새로 만들지 않고, Publishing Center가 이미
    // category + 연결 상품명으로 Tags를 자동 생성하는 기존 로직을 그대로 활용한다.
    const linkedProductNames = newDraft.productIds
      .map((id) => products.find((p) => p.id === id)?.name)
      .filter(Boolean);

    // Shorts Prompt 자동 생성: 기존 Shorts Studio 로직을 재사용한다 (그 파일의 UI/구조는 변경하지 않음).
    const shortsPromptText =
      newDraft.category === "Outdoor Safety"
        ? buildOutdoorSafetyFilePrompt({ aiEngine: "MagicLight", productNames: linkedProductNames })
        : newDraft.category === "Mystery"
          ? buildMysteryBlackFilePrompt({
              aiEngine: "MagicLight",
              duration: "60s",
              productNames: linkedProductNames,
            })
          : `[알림] "${newDraft.category}" 카테고리 Shorts 템플릿은 아직 준비되지 않았습니다.`;

    // Publishing Center 자동 등록: Video Library에 Pending 영상 항목을 자동 생성해
    // relatedBlogSlug로 새 Draft와 연결한다 (mp4Path는 실제 영상이 없으므로 비워둠 — 정상 동작).
    const videoLibrary = readList(KEYS.videoLibrary);
    const newVideoEntry = {
      id: newId("video"),
      videoTitle: `${newTopic} - Shorts`,
      mp4Path: "",
      relatedBlogSlug: newSlug,
      channel: "ATLAS Shorts - Main",
      status: "Pending",
      memo: shortsPromptText,
      updatedAt: new Date().toISOString(),
    };
    writeList(KEYS.videoLibrary, [newVideoEntry, ...videoLibrary]);

    handleLoadDraft(newDraft);
    setGenerateResult({
      topic: newTopic,
      slug: newSlug,
      productCount: newDraft.productIds.length,
      imagePromptCount: newImagePrompts.length,
      shortsPrompt: shortsPromptText,
    });
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Blog Studio</h1>
            <p className="mt-1 text-sm text-zinc-400">
              한국어 MASTER 본문 작성 · Meta/Slug · 제품 연결 관리
            </p>
          </div>
          {editingId && (
            <button
              onClick={handleNewDraft}
              className="text-sm text-emerald-400 hover:underline"
            >
              + 새 초안
            </button>
          )}
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Topic"
                  value={form.topic}
                  onChange={(v) => updateField("topic", v)}
                />
                <label className="block text-sm">
                  <span className="text-zinc-400">Category</span>
                  <select
                    value={form.category}
                    onChange={(e) => updateField("category", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">한국어 MASTER 본문</span>
                  <button
                    type="button"
                    onClick={insertBlogDNATemplate}
                    className="text-xs text-emerald-400 hover:underline"
                  >
                    Insert Blog DNA Template
                  </button>
                </div>
                <textarea
                  value={form.body}
                  onChange={(e) => updateField("body", e.target.value)}
                  rows={14}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
                <p className="mt-1 text-xs text-zinc-600">
                  Blog DNA 순서: Problem → Situation → Evidence → Solution →
                  Checklist → Problem Reminder → Recommended Gear → FAQ →
                  Sources → Related Articles → CTA. 두 개의 샵(##) 섹션
                  제목, 꺾쇠 세 개(SAFETY FACT/COMMON MISTAKE/DID YOU KNOW
                  콜아웃), 샵 세 개(###) 상품명(Why it matters/Best
                  for/Expected Use) 컨벤션을 쓰면 아래 Preview에 반영됩니다.
                </p>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Meta Description"
                  value={form.metaDescription}
                  onChange={(v) => updateField("metaDescription", v)}
                  textarea
                  rows={2}
                />
                <Field
                  label="Slug"
                  value={form.slug}
                  onChange={(v) => updateField("slug", v)}
                  placeholder="/example-slug"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-400">상태</span>
                  <select
                    value={form.status}
                    onChange={(e) => updateField("status", e.target.value)}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => persist(form.status)}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
                >
                  Save Draft
                </button>
                <button
                  onClick={() => persist("Approved")}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Mark as Approved
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">Image Prompt 목록</h2>
              <div className="mt-3 flex gap-2">
                <input
                  value={imagePromptInput}
                  onChange={(e) => setImagePromptInput(e.target.value)}
                  placeholder="이미지 프롬프트 입력"
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
                <button
                  onClick={addImagePrompt}
                  className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
                >
                  추가
                </button>
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {form.imagePrompts.map((prompt, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-2 last:border-0"
                  >
                    <span className="text-zinc-300">{prompt}</span>
                    <button
                      onClick={() => removeImagePrompt(i)}
                      className="shrink-0 text-xs text-red-400 hover:underline"
                    >
                      삭제
                    </button>
                  </li>
                ))}
                {form.imagePrompts.length === 0 && (
                  <li className="text-zinc-500">등록된 이미지 프롬프트가 없습니다.</li>
                )}
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">Recommended Gear 연결 상품</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Product Center에 등록된 상품 중 이 글의 "Recommended Gear"
                섹션에 연결할 상품을 선택합니다. (Product Center 자체는
                수정하지 않습니다)
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {products.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.productIds.includes(p.id)}
                        onChange={() => toggleProduct(p.id)}
                      />
                      <span>
                        {p.name}{" "}
                        <span className="text-xs text-zinc-500">
                          ({p.category || "미분류"})
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
                {products.length === 0 && (
                  <li className="text-zinc-500">
                    Product Center에 등록된 상품이 없습니다.
                  </li>
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">Production Pipeline</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Approved MASTER 하나를 골라 Generate를 누르면 Title/Slug/SEO
                Meta/FAQ/Sources/Image Prompt 6개/Product 연결/Shorts
                Prompt까지 자동으로 채운 새 Draft가 생성되고 Publishing
                Center에 자동 등록됩니다.
              </p>
              <div className="mt-3 space-y-2">
                <select
                  value={generateSourceId}
                  onChange={(e) => setGenerateSourceId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="">MASTER 선택 (Approved만)</option>
                  {drafts
                    .filter((d) => d.status === "Approved")
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.topic} ({d.category})
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleGenerate}
                  disabled={!generateSourceId}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Generate
                </button>
              </div>

              {generateResult && (
                <div className="mt-3 space-y-1 rounded-lg border border-emerald-800 bg-emerald-500/5 p-3 text-xs text-zinc-300">
                  <p className="font-semibold text-emerald-400">
                    Draft 생성 완료: {generateResult.topic}
                  </p>
                  <p>Slug: {generateResult.slug}</p>
                  <p>Product 자동 연결: {generateResult.productCount}개</p>
                  <p>Image Prompt: {generateResult.imagePromptCount}개</p>
                  <p>Shorts Prompt 자동 생성 완료 (Video Library에 Pending으로 등록됨)</p>
                  <p className="text-zinc-500">
                    Publishing Center에서 이 Draft를 확인할 수 있습니다.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">저장된 초안 ({drafts.length})</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {drafts.map((d) => (
                  <li
                    key={d.id}
                    className={`rounded-lg border p-3 ${
                      editingId === d.id ? "border-emerald-600" : "border-zinc-800"
                    }`}
                  >
                    <button
                      onClick={() => handleLoadDraft(d)}
                      className="text-left"
                    >
                      <p className="font-medium text-zinc-100">
                        {d.topic || "(제목 없음)"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {d.category} · {d.status}
                      </p>
                    </button>
                    <button
                      onClick={() => handleDeleteDraft(d.id)}
                      className="mt-1 text-xs text-red-400 hover:underline"
                    >
                      삭제
                    </button>
                  </li>
                ))}
                {drafts.length === 0 && (
                  <li className="text-zinc-500">저장된 초안이 없습니다.</li>
                )}
              </ul>
            </div>
          </div>
        </section>

        <section>
          <BlogDNAPreview form={form} products={products} />
        </section>
      </div>
    </div>
  );
}

// Experience Design: 6장 기준 이미지 슬롯 라벨. 데이터는 기존 imagePrompts 배열을
// 그대로 위치(index)로만 재사용한다 — 새 필드 없음.
const IMAGE_SLOT_LABELS = [
  "Situation",
  "Real Scene",
  "Map / Checklist",
  "Gear in Use",
  "Comparison",
  "Closing",
];

function BlogDNAPreview({ form, products }) {
  const sections = parseBlogDNASections(form.body);
  // Revenue DNA: Safety Fact/Common Mistake/Did You Know은 카드 과잉을 막기 위해 첫 1개만 노출
  const safetyFact = parseCallouts(form.body, "SAFETY FACT")[0];
  const commonMistake = parseCallouts(form.body, "COMMON MISTAKE")[0];
  const didYouKnow = parseCallouts(form.body, "DID YOU KNOW")[0];
  const checklist = parseBulletList(sections["Checklist"]);
  const faq = parseFaqPairs(sections["FAQ"]);
  const gearFromBody = parseRecommendedGearFromBody(sections["Recommended Gear"]);
  const images = form.imagePrompts || [];

  const linkedProducts = (form.productIds || [])
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean);
  const gearCards = linkedProducts.map((p) => {
    const authored = gearFromBody.find(
      (g) => g.name.toLowerCase() === p.name.toLowerCase()
    );
    return {
      name: p.name,
      why: authored?.why || "(본문 Recommended Gear에 Why it matters를 추가하세요)",
      bestFor: authored?.bestFor || "(본문 Recommended Gear에 Best for를 추가하세요)",
      expectedUse: authored?.expectedUse || [],
    };
  });

  const sourcesEntries = parsePairedEntries(sections["Sources"]);
  const relatedEntries = parsePairedEntries(sections["Related Articles"]);
  const relatedDisplay = relatedEntries.length
    ? relatedEntries.slice(0, 3)
    : [
        { name: "관련 글 준비 중", description: "" },
        { name: "관련 글 준비 중", description: "" },
        { name: "관련 글 준비 중", description: "" },
      ];
  const shorts = parseShortsInfo(sections["Shorts"]);
  const problemReminder = sections["Problem Reminder"]?.trim();

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">
        Experience Preview{" "}
        <span className="text-xs font-normal text-zinc-500">
          (Hero 없음 · 모바일 우선 · Blog DNA/Revenue DNA 순서 및 문구 그대로)
        </span>
      </h2>

      <div className="mx-auto mt-4 max-w-sm space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        {/* 첫 화면: Title → Summary → Quick Answer → Reader Promise (모바일 첫 화면 안에 보여야 함) */}
        <div>
          <h3 className="text-lg font-bold text-zinc-100">
            {form.topic || "(Title 없음)"}
          </h3>
          <p className="mt-1 text-sm text-zinc-400">
            {form.metaDescription || "(Summary 없음)"}
          </p>
          <div className="mt-3 rounded-lg border border-emerald-700 bg-emerald-500/5 p-3 text-sm">
            <p className="text-xs font-semibold text-emerald-400">Quick Answer</p>
            <p className="mt-1 text-zinc-200">
              {sections["Quick Answer"] ||
                "(Quick Answer 없음 — 첫 화면에서 바로 답을 줘야 합니다)"}
            </p>
          </div>
          <p className="mt-2 text-xs italic text-zinc-500">
            {sections["Reader Promise"] || "(Reader Promise 없음)"}
          </p>
        </div>

        {/* Story: Problem → Situation → Evidence */}
        <PreviewSection title="Problem" text={sections["Problem"]} />

        {/* 이미지 1: Situation */}
        <ImageSlot label={IMAGE_SLOT_LABELS[0]} prompt={images[0]} />

        <PreviewSection title="Situation" text={sections["Situation"]} />
        <PreviewSection title="Evidence" text={sections["Evidence"]} />

        {/* 카드 1/3: Safety Fact — Evidence 직후, 스토리에 자연스럽게 녹아듦 */}
        {safetyFact && <DesignCard tone="emerald" label="Safety Fact" text={safetyFact} />}

        {/* 이미지 2: Real Scene */}
        <ImageSlot label={IMAGE_SLOT_LABELS[1]} prompt={images[1]} />

        {/* Info → Action: Solution → Checklist */}
        <PreviewSection title="Solution" text={sections["Solution"]} />

        {checklist.length > 0 && (
          <DesignCard tone="neutral" label="Quick Checklist">
            <ul className="space-y-1">
              {checklist.map((item, i) => (
                <li key={i}>☐ {item}</li>
              ))}
            </ul>
          </DesignCard>
        )}

        {/* 이미지 3: Map / Checklist */}
        <ImageSlot label={IMAGE_SLOT_LABELS[2]} prompt={images[2]} />

        {/* 카드 2/3: Common Mistake — Gear로 넘어가기 전 주의 환기 */}
        {commonMistake && <DesignCard tone="amber" label="Common Mistake" text={commonMistake} />}

        {/* 작은 카드형 Shorts */}
        <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-sm">
            ▶
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-300">60-second version</p>
            <p className="truncate text-xs text-zinc-500">
              {shorts.caption || "(Caption 없음)"}
            </p>
            <p className="truncate text-[11px] text-zinc-700">
              {shorts.url || "(영상 URL 없음 — Placeholder)"}
            </p>
          </div>
        </div>

        {problemReminder && (
          <p className="text-sm italic text-zinc-300">{problemReminder}</p>
        )}

        {/* 이미지 4: Gear in Use */}
        <ImageSlot label={IMAGE_SLOT_LABELS[3]} prompt={images[3]} />

        {/* Gear: 1열 카드, 여백 충분히. Image → Name → Why it matters → Best for → Expected Use → Check Details */}
        <div>
          <p className="text-sm font-semibold text-zinc-100">Recommended Gear</p>
          <div className="mt-3 space-y-4">
            {gearCards.map((gear) => (
              <div key={gear.name} className="rounded-lg border border-zinc-800 p-4">
                <div className="flex h-20 items-center justify-center rounded-md bg-zinc-800 text-xl">
                  🖼️
                </div>
                <p className="mt-3 text-sm font-medium text-zinc-100">{gear.name}</p>
                <p className="mt-1 text-xs text-zinc-400">Why it matters: {gear.why}</p>
                <p className="mt-1 text-xs text-zinc-400">Best for: {gear.bestFor}</p>
                {gear.expectedUse.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {gear.expectedUse.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <button type="button" className="mt-2 text-xs font-semibold text-emerald-400">
                  Check Details →
                </button>
              </div>
            ))}
            {gearCards.length === 0 && (
              <p className="text-xs text-zinc-500">연결된 상품이 없습니다.</p>
            )}
          </div>
          {gearCards.length > 0 && (
            <p className="mt-2 text-[11px] text-zinc-600">
              We only recommend gear directly related to this guide.
            </p>
          )}
        </div>

        {/* 이미지 5: Comparison */}
        <ImageSlot label={IMAGE_SLOT_LABELS[4]} prompt={images[4]} />

        {/* Next Action: FAQ → Did You Know → Before You Leave Today */}
        {faq.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-zinc-100">FAQ</p>
            <div className="mt-2 space-y-2 text-sm">
              {faq.map((item, i) => (
                <div key={i}>
                  <p className="font-medium text-zinc-200">{item.q}</p>
                  <p className="text-zinc-400">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 카드 3/3: Did You Know — FAQ 뒤, Sources 앞 */}
        {didYouKnow && <DesignCard tone="sky" label="Did You Know?" text={didYouKnow} />}

        {checklist.length > 0 && (
          <div className="rounded-lg border border-emerald-800 bg-emerald-500/5 p-3">
            <p className="text-xs font-semibold text-emerald-400">Before You Leave Today</p>
            <ul className="mt-1 space-y-1 text-sm text-zinc-200">
              {checklist.slice(0, 3).map((item, i) => (
                <li key={i}>✓ {item}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="text-sm font-semibold text-zinc-100">Sources & References</p>
          <ul className="mt-2 space-y-1 text-xs text-zinc-500">
            {sourcesEntries.length > 0 ? (
              sourcesEntries.map((s, i) => (
                <li key={i}>
                  <span className="text-zinc-300">{s.name}</span>
                  {s.description && <span> — {s.description}</span>}
                </li>
              ))
            ) : (
              <li>(Sources 없음)</li>
            )}
          </ul>
        </div>

        {/* Related Articles: 3개 카드형 (썸네일 + 제목 + 1줄 설명) */}
        <div>
          <p className="text-sm font-semibold text-zinc-100">Related Articles</p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {relatedDisplay.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 p-2"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-sm">
                  🖼️
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-200">{item.name}</p>
                  {item.description && (
                    <p className="truncate text-[11px] text-zinc-500">{item.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 이미지 6: Closing */}
        <ImageSlot label={IMAGE_SLOT_LABELS[5]} prompt={images[5]} />

        {/* CTA: 큰 버튼 없이 심플하게. 문구는 Revenue DNA 그대로 유지 */}
        <div className="pt-1 text-center">
          <p className="text-xs text-zinc-500">ATLAS Outdoor Safety</p>
          <p className="mt-1 text-sm text-zinc-200">Preparation saves lives.</p>
          <p className="mt-2 text-xs font-semibold text-emerald-400">
            Read the next Safety File.
          </p>
        </div>
      </div>
    </div>
  );
}

function PreviewSection({ title, text }) {
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      <p className="mt-1 text-sm text-zinc-300">
        {text?.trim() || `(${title} 섹션 없음)`}
      </p>
    </div>
  );
}

// Visual Cards: Safety Fact / Common Mistake / Did You Know / Quick Checklist
// 4종만 사용하고 색상·아이콘·여백을 통일한다.
const DESIGN_CARD_STYLES = {
  emerald: { icon: "🛟", className: "border-emerald-700 bg-emerald-500/5 text-emerald-300" },
  amber: { icon: "⚠️", className: "border-amber-700 bg-amber-500/5 text-amber-300" },
  sky: { icon: "💡", className: "border-sky-700 bg-sky-500/5 text-sky-300" },
  neutral: { icon: "✅", className: "border-zinc-700 bg-zinc-900 text-zinc-300" },
};

function DesignCard({ tone, label, text, children }) {
  const style = DESIGN_CARD_STYLES[tone] || DESIGN_CARD_STYLES.neutral;
  return (
    <div className={`rounded-lg border p-3 text-xs ${style.className}`}>
      <p className="font-semibold">
        {style.icon} {label}
      </p>
      <div className="mt-1 text-sm text-zinc-200">{children || text}</div>
    </div>
  );
}

function ImageSlot({ label, prompt }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-lg">
        🖼️
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-zinc-400">Image · {label}</p>
        <p className="truncate text-xs text-zinc-600">
          {prompt || "(이미지 프롬프트 없음)"}
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, textarea, rows, placeholder }) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-400">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows || 3}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
      )}
    </label>
  );
}
