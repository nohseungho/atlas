"use client";

import { useEffect, useState } from "react";
import { KEYS, readList } from "@/app/atlas/lib/storage";

const CATEGORIES = ["Mystery", "History", "Nature", "Outdoor Safety"];
const AI_ENGINES = ["MagicLight", "Seedance", "Kling", "Veo", "Runway"];
const DURATIONS = ["30s", "60s", "90s"];

const PACING_BY_DURATION = {
  "30s": "3~4 cuts, 컷당 최대 6초, 군더더기 없이 바로 리빌로 진입",
  "60s": "5~7 cuts, 훅 이후 긴장 축적 구간 1개 추가 가능",
  "90s": "7~10 cuts, 몰입을 위한 정적 롱컷 1개 허용",
};

// Production Pipeline(Blog Studio Generate)에서도 재사용하므로 export한다.
// 로직/UI는 그대로이며 export 키워드만 추가한 것으로 Shorts Studio 자체는 변경되지 않는다.
export function buildMysteryBlackFilePrompt({ aiEngine, duration, productNames }) {
  const pacing = PACING_BY_DURATION[duration];
  const productLine = productNames.length
    ? productNames.join(", ")
    : "(연결된 제품 없음)";

  return `[ATLAS BLACK FILE — MagicLight Prompt]

Style: ATLAS BLACK FILE (다크 다큐멘터리 미스터리, 아카이브 톤, 절제된 내레이션)
AI Engine: ${aiEngine}
Duration: ${duration}
Pacing: ${pacing}

Scene Structure:
1. Hook (0-3s): 설명 없이 하나의 미해결 이미지/질문만 제시
2. Escalation: 짧은 컷으로 조각난 사실을 이어 붙여 불안감 축적
3. Reveal: 핵심 사실을 과장 없이 담담하게 제시
4. Comment Bait: 시청자에게 답이 정해지지 않은 질문을 남김
5. CTA: 정적인 텍스트 카드로 블로그 풀버전 유도

Visual Direction: 로우키 조명, 그레인 텍스처, 저채도 컬러 그레이딩, 화면 텍스트 최소화, 다큐멘터리 내레이션 페이싱.

Tone: 팩트 기반, 절제, 과장 없는 미해결 기록으로서의 미스터리.

Product Tie-in: ${productLine}`;
}

// MagicLight 프롬프트는 해외 시청자 대상 영상 생성에 쓰이므로 영문으로 작성한다.
const PRODUCT_NAME_EN = {
  등산화: "hiking boots",
  헤드랜턴: "headlamp",
  방수백: "dry bag",
  게이터: "gaiters",
  응급키트: "first-aid kit",
};

export function buildOutdoorSafetyFilePrompt({ aiEngine, productNames }) {
  const englishNames = productNames.map((name) => PRODUCT_NAME_EN[name] || name);
  const productLine = englishNames.length ? englishNames.join(", ") : "(no linked product)";

  return `[ATLAS SAFETY FILE — MagicLight Prompt]

Style: ATLAS SAFETY FILE (documentary-tone outdoor safety record)
AI Engine: ${aiEngine}
Duration: 60s
Aspect Ratio: 9:16
Scenes: 12

Scene Structure:
1. Hook: One shot capturing the gap between "easy trail" and what actually happens on it.
2. Real Situation: A realistic hiking scenario that led to an actual rescue call.
3. Root Cause: Not missing gear, but one or two basic essentials left behind.
4. Checklist: A quick rundown of the core Ten Essentials-based checklist.
5. Gear Tie-in: Naturally connect each checklist item to the real gear it maps to.
6. ATLAS Closing: "The mountain is open to everyone. It is never forgiving of those who aren't ready."

Visual Direction: Documentary tone, natural lighting, real trail footage feel, minimal on-screen text overlays.

Tone: Fact-based, restrained, focused on safety information rather than salesmanship.

Product Tie-in: ${productLine}`;
}

export default function ShortsStudioPage() {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [aiEngine, setAiEngine] = useState(AI_ENGINES[0]);
  const [duration, setDuration] = useState(DURATIONS[0]);
  const [products, setProducts] = useState([]);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    setProducts(readList(KEYS.products));
  }, []);

  function toggleProduct(id) {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function handleGenerate() {
    const productNames = products
      .filter((p) => selectedProductIds.includes(p.id))
      .map((p) => p.name);

    if (category === "Mystery") {
      setPrompt(buildMysteryBlackFilePrompt({ aiEngine, duration, productNames }));
      return;
    }
    if (category === "Outdoor Safety") {
      setPrompt(buildOutdoorSafetyFilePrompt({ aiEngine, productNames }));
      return;
    }
    setPrompt(
      `[알림] "${category}" 카테고리 템플릿은 아직 준비되지 않았습니다.\n현재는 Mystery + ATLAS BLACK FILE, Outdoor Safety + ATLAS SAFETY FILE 스타일만 지원합니다.`
    );
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold">Shorts Studio</h1>
          <p className="mt-1 text-sm text-zinc-400">
            카테고리 · AI 엔진 · 길이 기준 MagicLight 프롬프트 생성 (현재는
            Mystery + ATLAS BLACK FILE, Outdoor Safety + ATLAS SAFETY FILE
            스타일만 하드코딩)
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">Prompt Input</h2>
            <div className="mt-4 space-y-3">
              <SelectField
                label="카테고리"
                value={category}
                onChange={setCategory}
                options={CATEGORIES}
              />
              <SelectField
                label="AI Engine"
                value={aiEngine}
                onChange={setAiEngine}
                options={AI_ENGINES}
              />
              <SelectField
                label="영상 길이"
                value={duration}
                onChange={setDuration}
                options={DURATIONS}
              />

              <div>
                <span className="text-sm text-zinc-400">
                  관련 제품 (Product Center 참조)
                </span>
                <ul className="mt-2 space-y-2 text-sm">
                  {products.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(p.id)}
                          onChange={() => toggleProduct(p.id)}
                        />
                        <span>{p.name}</span>
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
            </div>

            <button
              onClick={handleGenerate}
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Generate Prompt
            </button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">MagicLight Prompt</h2>
            <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-zinc-950 p-4 text-sm text-zinc-300">
              {prompt || "Generate Prompt를 눌러 결과를 확인하세요."}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
