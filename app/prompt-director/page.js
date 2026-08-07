"use client";

import { useState } from "react";
import Link from "next/link";

// Sprint 1 MVP: 샘플 데이터 전용 화면. API/DB/AI 연동 없음.
const sampleTopic = {
  topic: "Hiking & Outdoor Safety Gear",
  primaryKeyword: "hiking safety gear checklist",
  blogTitle: "Hiking Safety Gear Checklist: What You Actually Need (and Why)",
  slug: "/hiking-safety-gear-checklist",
  tags: [
    "hiking safety",
    "outdoor gear",
    "ten essentials",
    "hiking checklist",
    "trail safety",
  ],
  productCategories: [
    "first-aid kit",
    "headlamp",
    "dry bag",
    "hiking boots",
    "gaiters",
  ],
  shortsHook: 'Most hiking rescues happen on "easy" trails — here\'s why.',
};

function buildMagicLightPrompt(input) {
  return `[MagicLight Prompt]

Topic: ${input.topic}
Primary Keyword: ${input.primaryKeyword}
Blog Title: ${input.blogTitle}

Shorts Hook:
"${input.shortsHook}"

Structure:
1. Hook (0-3s): ${input.shortsHook}
2. Shock Point: Reveal the most overlooked item from the safety checklist.
3. Comment Bait: Ask viewers which item they always forget to pack.
4. CTA: Direct viewers to the full checklist and linked gear.

Product Tie-in: ${input.productCategories}

Tone: Fact-based, no exaggeration, practical outdoor/travel safety framing.`;
}

export default function PromptDirectorPage() {
  const [topic, setTopic] = useState(sampleTopic.topic);
  const [primaryKeyword, setPrimaryKeyword] = useState(
    sampleTopic.primaryKeyword
  );
  const [blogTitle, setBlogTitle] = useState(sampleTopic.blogTitle);
  const [shortsHook, setShortsHook] = useState(sampleTopic.shortsHook);
  const [productCategories, setProductCategories] = useState(
    sampleTopic.productCategories.join(", ")
  );
  const [prompt, setPrompt] = useState("");

  function handleGenerate() {
    setPrompt(
      buildMagicLightPrompt({
        topic,
        primaryKeyword,
        blogTitle,
        shortsHook,
        productCategories,
      })
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Prompt Director</h1>
            <p className="mt-1 text-sm text-zinc-400">
              쇼츠 프롬프트 + 블로그 SEO + 제휴상품 연결 MVP (샘플 데이터 전용)
            </p>
          </div>
          <Link href="/" className="text-sm text-emerald-400 hover:underline">
            ← Dashboard
          </Link>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">Prompt Input</h2>
            <div className="mt-4 space-y-3">
              <Field label="Topic" value={topic} onChange={setTopic} />
              <Field
                label="Primary Keyword"
                value={primaryKeyword}
                onChange={setPrimaryKeyword}
              />
              <Field
                label="Blog Title"
                value={blogTitle}
                onChange={setBlogTitle}
              />
              <Field
                label="Shorts Hook"
                value={shortsHook}
                onChange={setShortsHook}
                textarea
              />
              <Field
                label="Product Categories (comma separated)"
                value={productCategories}
                onChange={setProductCategories}
              />
            </div>

            <button
              onClick={handleGenerate}
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Generate Prompt
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">MagicLight Prompt</h2>
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-zinc-950 p-4 text-sm text-zinc-300">
                {prompt || "Generate Prompt를 눌러 결과를 확인하세요."}
              </pre>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">Content Package Preview</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <PreviewRow label="SEO Title" value={sampleTopic.blogTitle} />
                <PreviewRow
                  label="Primary Keyword"
                  value={sampleTopic.primaryKeyword}
                />
                <PreviewRow label="Slug" value={sampleTopic.slug} />
                <PreviewRow
                  label="Product Links"
                  value={sampleTopic.productCategories.join(", ")}
                />
                <PreviewRow label="Shorts Hook" value={sampleTopic.shortsHook} />
                <PreviewRow label="Tags" value={sampleTopic.tags.join(", ")} />
              </dl>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, textarea }) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-400">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
        />
      )}
    </label>
  );
}

function PreviewRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-zinc-800 pb-2 last:border-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-zinc-200">{value}</dd>
    </div>
  );
}
