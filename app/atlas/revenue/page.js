"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import TrafficStep from "./TrafficStep";
import { KEYS, readList } from "@/app/atlas/lib/storage";
import { listImages } from "@/app/atlas/lib/image-store";
import { affiliateState, buildProductSnapshot } from "@/lib/atlas/product-link";
import { castDisplayLabel, characterDisplayName } from "@/lib/atlas/letters-cast";
import { formatAmount } from "@/lib/atlas/photo-card/product-model";
import { suggestProductsForTopic, suggestProductCategories, isWellnessText } from "@/lib/atlas/wellness-scope";

// ─── 블로그 글 만들기 — 1번부터 5번까지 한 화면 ─────────────────────────────
// 사용자는 설명 없이 위에서 아래로 따라가기만 하면 된다. 화면에는 "지금 눌러야
// 할 버튼 1개"만 보이고, 앞 단계가 끝나면 다음 단계가 자동으로 열린다.
// 개발자용 정보(내부 Job 번호, 스키마명, 중복 판정 상세, 런타임 진단, 서버
// 자동 제작, 쇼츠·캠페인·성과)는 지우지 않고 맨 아래 "고급 설정" 안에 보존한다.
// API와 저장 로직은 기존 것을 그대로 호출한다.

const STEPS = [
  { n: 1, title: "글 주제 선택", hint: "이번 주 추천 주제 중 하나를 고릅니다." },
  { n: 2, title: "제작 요청 파일 받기", hint: "받은 파일을 ChatGPT에 올려 글을 만듭니다." },
  { n: 3, title: "완성 글 파일 등록", hint: "ChatGPT가 준 파일을 이 화면에 등록합니다." },
  { n: 4, title: "미리보기·검수", hint: "본문을 확인하고 발행을 승인합니다." },
  { n: 5, title: "블로그 발행", hint: "블로그에 실제로 올립니다." },
  { n: 6, title: "트래픽 배포", hint: "발행한 글을 사람들이 찾아오게 만듭니다." },
];

const STATE_STYLE = {
  done: "border-emerald-600 bg-emerald-950/40 text-emerald-300",
  active: "border-sky-500 bg-sky-950/40 text-sky-200",
  wait: "border-zinc-800 bg-zinc-900 text-zinc-500",
};
const STATE_LABEL = { done: "완료", active: "진행 중", wait: "대기" };

async function api(url, options) {
  const res = await fetch(url, { cache: "no-store", ...options });
  return res.json().catch(() => ({}));
}

// Saves a JSON object as a file download. The anchor is attached to the document
// and the object URL is only revoked after the click has been processed —
// Chrome cancels the download of a detached anchor whose blob URL is revoked in
// the same tick, which looks exactly like "the button does nothing".
function downloadJson(filename, obj) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// 요청 파일을 이미 받았는지 / 완성 글이 등록됐는지 / 승인·발행됐는지를 저장된
// 작업 기록에서 그대로 읽는다. 화면이 상태를 따로 만들지 않으므로 새로고침해도
// 같은 단계가 열린다.
function currentStepOf(job, row) {
  if (!job) return 1;
  const requestReady = job.mode === "CHATGPT_HANDOFF" || Boolean(job.articleId);
  if (!requestReady) return 2;
  if (!job.articleId) return 3;
  // 발행이 끝나야 트래픽 배포가 열린다 — 공개 URL이 없으면 홍보할 대상이 없다.
  if (row?.publishState === "published") return 6;
  if (row?.publishState === "approved" || row?.canPublish) return 5;
  return 4;
}

export default function RevenuePage() {
  // useSearchParams는 Suspense 안에서만 쓸 수 있다 (발행 화면과 같은 방식).
  return (
    <Suspense fallback={null}>
      <RevenueScreen />
    </Suspense>
  );
}

function RevenueScreen() {
  const searchParams = useSearchParams();
  const [rec, setRec] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [rows, setRows] = useState([]);
  const [pipeline, setPipeline] = useState(null);
  const [shorts, setShorts] = useState([]);
  const [tracking, setTracking] = useState(null);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null); // { step, ok, text }
  const [pickedTopic, setPickedTopic] = useState(null);
  const [currentJobId, setCurrentJobId] = useState("");
  const [openStep, setOpenStep] = useState(null);
  // Product Center 상품(브라우저 localStorage). 새 글을 시작할 때 여기서 고른
  // 상품이 제작 요청 파일에 스냅샷으로 실린다.
  const [products, setProducts] = useState([]);
  const [linkedProductIds, setLinkedProductIds] = useState([]);

  async function loadWork() {
    const [pj, pub] = await Promise.all([api("/api/atlas/production-jobs"), api("/api/atlas/publisher-status")]);
    setJobs(pj.jobs || []);
    setRows(pub.rows || []);
  }

  useEffect(() => {
    // Client-side fetch-on-mount against our own API routes (admin tool).
    async function loadAll() {
      const [r, p, s, t] = await Promise.all([
        api("/api/atlas/recommendations"),
        api("/api/atlas/pipeline"),
        api("/api/atlas/shorts"),
        api("/api/atlas/tracking"),
      ]);
      setRec(r);
      setPipeline(p);
      setShorts(s.drafts || []);
      setTracking(t);
      await loadWork();
    }
    loadAll();
  }, []);

  const rowFor = (job) => rows.find((r) => r.articleId === job?.articleId) || null;
  const publishedIds = useMemo(
    () => new Set(rows.filter((r) => r.publishState === "published").map((r) => r.articleId)),
    [rows],
  );
  const isPublished = (job) => Boolean(job?.articleId) && publishedIds.has(job.articleId);

  // 이 화면이 다루는 글 = 사람이 5단계로 진행하는 작업. 실패로 판정됐거나 서버
  // 제공자 미연결로 막힌 옛 작업은 목록에서 빼고 고급 설정에만 남긴다.
  const flow = useMemo(
    () =>
      jobs
        .filter((j) => j.topic && j.status !== "FAILED" && !String(j.status).startsWith("BLOCKED"))
        .sort((a, b) => b.id.localeCompare(a.id)),
    [jobs],
  );

  // 발행 화면에서 "6단계 트래픽 배포로 이동"으로 넘어오면 그 글을 그대로 연다.
  // 주소에 남아 있으므로 새로고침해도 같은 글이 다시 선택된다. 없는 id면 아무것도
  // 하지 않고 평소 기본 선택(가장 최근 작업)으로 둔다.
  const focusArticleId = searchParams.get("articleId") || "";
  const focusJobId = searchParams.get("jobId") || "";
  const focusProductId = searchParams.get("productId") || "";
  const focusApplied = useRef("");

  // Product Center 상품은 브라우저 localStorage에 있으므로 마운트 후에 읽는다.
  // "블로그에 연결"로 넘어오면 그 상품이 미리 선택된 채 열린다. 렌더 중 연쇄
  // setState가 되지 않도록 다른 화면과 같은 방식으로 한 틱 뒤에 반영한다.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const list = readList(KEYS.products);
      setProducts(list);
      if (focusProductId && list.some((p) => p.id === focusProductId)) {
        setLinkedProductIds([focusProductId]);
        setCurrentJobId("__new__");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [focusProductId]);

  useEffect(() => {
    const key = `${focusJobId}|${focusArticleId}`;
    if (!focusJobId && !focusArticleId) return;
    if (focusApplied.current === key || flow.length === 0) return;
    const match = flow.find(
      (j) => (focusJobId && j.id === focusJobId) || (focusArticleId && j.articleId === focusArticleId),
    );
    focusApplied.current = key;
    if (match) {
      setCurrentJobId(match.id);
      setOpenStep(null);
    }
  }, [flow, focusArticleId, focusJobId]);

  // "__new__" = 사용자가 새 글을 시작한 상태 (아직 작업 기록이 없다).
  const job = currentJobId === "__new__" ? null : flow.find((j) => j.id === currentJobId) || flow[0] || null;
  const row = rowFor(job);
  const cur = job ? currentStepOf(job, row) : pickedTopic ? 2 : 1;
  const published = Boolean(job) && isPublished(job);
  const open = openStep ?? cur;

  // 진행 단계가 바뀌면 손으로 펼쳐 둔 고정을 푼다. 이게 없으면 1번을 펼쳐 둔 채
  // 주제를 고른 순간 2번이 "진행 중"으로 표시만 되고 접힌 채 남아, 눌러야 할
  // "제작 요청 파일 받기" 버튼이 화면 어디에도 보이지 않는다.
  useEffect(() => {
    setOpenStep(null);
  }, [cur]);

  const statusOf = (n) => (n < cur ? "done" : n === cur ? "active" : "wait");
  const goto = (n) => {
    setMsg(null);
    setOpenStep(n);
  };
  // 작업이 끝나면 새 상태를 다시 읽고, 다음 단계가 스스로 열리게 한다.
  const advance = () => setOpenStep(null);

  const topicForRequest = job?.recommendation || pickedTopic;

  // ── 2. 제작 요청 파일 받기 (기존 /api/atlas/chatgpt-request 그대로) ──
  // 연결된 상품을 "그때 확인된 값" 그대로 스냅샷으로 만든다. 이미지 본체는
  // 싣지 않고 어떤 이미지가 붙어 있는지만 가리킨다(요청 파일이 커지지 않게).
  async function buildLinkedSnapshots() {
    const chosen = products.filter((p) => linkedProductIds.includes(p.id));
    const out = [];
    for (const product of chosen) {
      let images = [];
      try {
        images = await listImages(product.id);
      } catch {
        images = [];
      }
      out.push(buildProductSnapshot(product, { images }));
    }
    return out;
  }

  async function getRequestFile() {
    if (!topicForRequest) return;
    setBusy("step2");
    setMsg(null);
    try {
      const linkedProducts = await buildLinkedSnapshots();
      const res = await fetch("/api/atlas/chatgpt-request", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogId: "blog_001", recommendation: topicForRequest, linkedProducts }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "ok" && data.request) {
        downloadJson(data.filename, data.request);
        setCurrentJobId(data.jobId);
        const linkedCount = data.linkedProductIds?.length ?? 0;
        setMsg({
          step: 2,
          ok: true,
          text:
            "요청 파일을 내려받았습니다. 이 파일을 ChatGPT에 올리고, 돌려받은 파일을 3번에서 등록하세요." +
            (linkedCount ? ` 연결 상품 ${linkedCount}건이 요청 파일에 포함되었습니다.` : ""),
        });
        await loadWork();
        advance();
      } else {
        setMsg({ step: 2, ok: false, text: `요청 파일을 만들지 못했습니다: ${data.message || data.errorCode || `서버 응답 ${res.status}`}` });
      }
    } catch (err) {
      setMsg({ step: 2, ok: false, text: `요청 파일을 만들지 못했습니다: 서버에 연결하지 못했습니다 (${String(err?.message || err)})` });
    }
    setBusy("");
  }

  // ── 3. 완성 글 파일 등록 (기존 /api/atlas/chatgpt-package 그대로) ──
  async function registerFinishedFile(file) {
    if (!file) return;
    setBusy("step3");
    setMsg({ step: 3, ok: true, text: "파일을 확인하고 이미지 올리는 중입니다. 잠시만 기다려 주세요." });
    try {
      const text = await file.text();
      let pkg;
      try {
        pkg = JSON.parse(text);
      } catch {
        setMsg({ step: 3, ok: false, text: "파일을 읽지 못했습니다 — ChatGPT가 돌려준 파일을 그대로 선택하세요." });
        setBusy("");
        return;
      }
      const data = await api("/api/atlas/chatgpt-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: pkg }),
      });
      if (data.status === "ok" && data.duplicate) {
        setMsg({ step: 3, ok: true, text: "이미 등록된 글입니다. 다시 등록하지 않고 다음 단계로 넘어갑니다." });
      } else if (data.status === "ok") {
        setMsg({ step: 3, ok: true, text: "등록과 자동 검수를 마쳤습니다. 4번에서 본문을 확인하세요." });
      } else if (data.status === "qa_failed") {
        setMsg({ step: 3, ok: false, text: `자동 검수를 통과하지 못했습니다 (${data.qa?.blocking?.length ?? 0}건). 아래 “고급 설정”에서 사유를 확인해 수정한 뒤 다시 등록하세요.` });
      } else if (data.status === "needs_configuration") {
        setMsg({ step: 3, ok: false, text: "이미지 저장소 설정이 필요합니다. 관리자에게 문의하세요." });
      } else {
        setMsg({ step: 3, ok: false, text: `등록하지 못했습니다: ${data.message || data.reason || data.errorCode || data.status}` });
      }
      await loadWork();
      if (data.status === "ok") advance();
    } catch {
      setMsg({ step: 3, ok: false, text: "등록하지 못했습니다: 서버에 연결하지 못했습니다." });
    }
    setBusy("");
  }

  // ── 4. 미리보기·검수 → 발행 승인 (기존 /api/atlas/publisher-approval 그대로) ──
  async function approveForPublish() {
    if (!job?.articleId) return;
    setBusy("step4");
    setMsg(null);
    const data = await api("/api/atlas/publisher-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: job.articleId, action: "approve" }),
    });
    if (data.status === "ok") {
      setMsg({ step: 4, ok: true, text: "발행 승인이 저장되었습니다. 5번에서 블로그에 올리세요." });
      setRows(data.rows || []);
      await loadWork();
      advance();
    } else {
      setMsg({ step: 4, ok: false, text: `승인하지 못했습니다: ${data.errorCode === "ALREADY_PUBLISHED" ? "이미 발행된 글입니다." : data.errorCode || "알 수 없는 이유"}` });
    }
    setBusy("");
  }

  // ── 고급: 기존 기능 유지 ──
  async function refreshRecommendations() {
    setBusy("rec");
    setRec(await api("/api/atlas/recommendations?fresh=1"));
    setBusy("");
  }
  async function autoProduce(candidate) {
    setBusy("auto");
    const created = await api("/api/atlas/production-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recommendation: candidate }),
    });
    if (created?.job?.id) {
      await api("/api/atlas/production-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", jobId: created.job.id }),
      });
    }
    await loadWork();
    setBusy("");
  }
  async function retryJob(jobId) {
    setBusy("retry" + jobId);
    await api("/api/atlas/production-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry", jobId }),
    });
    await loadWork();
    setBusy("");
  }
  async function startQaForArticle(articleId) {
    setBusy("qa");
    await api("/api/atlas/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkedArticleId: articleId }),
    });
    setPipeline(await api("/api/atlas/pipeline"));
    setBusy("");
  }
  async function jobAction(jobId, action) {
    setBusy(jobId + action);
    await api("/api/atlas/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, action }),
    });
    setPipeline(await api("/api/atlas/pipeline"));
    setBusy("");
  }
  async function makeShort(articleId) {
    setBusy("short" + articleId);
    await api("/api/atlas/shorts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId }),
    });
    setShorts((await api("/api/atlas/shorts")).drafts || []);
    setTracking(await api("/api/atlas/tracking"));
    setBusy("");
  }
  async function importCsv() {
    setBusy("csv");
    await api("/api/atlas/tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "importCsv", csv, source: "network", label: "manual CSV" }),
    });
    setTracking(await api("/api/atlas/tracking"));
    setBusy("");
  }

  const qaData = job?.steps?.CONTENT_QA?.data;

  return (
    <div className="px-4 py-8 sm:px-10 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold">블로그 글 만들기</h1>
          <p className="mt-1 text-sm text-zinc-400">
            아래 1번부터 5번까지 순서대로 따라가면 글 한 편이 블로그에 올라갑니다. 지금 눌러야 할 버튼만 보입니다.
          </p>
        </header>

        {/* ── 진행 표시 ── */}
        <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {STEPS.map((s) => {
            const st = statusOf(s.n);
            return (
              <li key={s.n}>
                <button
                  type="button"
                  onClick={() => (st === "wait" ? null : goto(s.n))}
                  disabled={st === "wait"}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${STATE_STYLE[st]} ${
                    open === s.n ? "ring-2 ring-sky-500/60" : ""
                  } ${st === "wait" ? "cursor-not-allowed" : "hover:brightness-125"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{s.n}</span>
                    <span className="text-xs font-semibold">{STATE_LABEL[st]}</span>
                    {st === "done" && <span aria-hidden>✓</span>}
                  </div>
                  <p className="mt-1 text-sm font-medium leading-tight">{s.title}</p>
                </button>
              </li>
            );
          })}
        </ol>

        {/* 글이 여러 개일 때만 노출. 내부 번호 대신 주제로 고른다. */}
        {flow.length > 1 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-xs text-zinc-500">내 글 목록 (누르면 그 글의 단계로 이동)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {flow.slice(0, 8).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setCurrentJobId(w.id);
                    setOpenStep(null);
                    setMsg(null);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    w.id === job?.id ? "border-sky-500 bg-sky-950/40 text-sky-200" : "border-zinc-700 text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {w.topic} · {currentStepOf(w, rowFor(w))}단계
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 1. 글 주제 선택 ── */}
        <StepCard step={STEPS[0]} status={statusOf(1)} open={open === 1} onOpen={() => goto(1)} onNext={() => goto(2)} nextEnabled={cur > 1}>
          {statusOf(1) === "done" && (job || pickedTopic) ? (
            <>
              <p className="text-sm text-zinc-300">
                고른 주제: <b className="text-zinc-100">{job?.topic || pickedTopic?.title}</b>
              </p>
              <button
                type="button"
                onClick={() => {
                  setCurrentJobId("__new__");
                  setPickedTopic(null);
                  goto(1);
                }}
                className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100"
              >
                다른 주제로 새 글 시작
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-400">이번 주 추천 주제입니다. 하나를 고르세요.</p>
              <div className="mt-3 space-y-2">
                {(rec?.candidates || []).map((c) => (
                  <button
                    key={c.priority}
                    type="button"
                    onClick={() => setPickedTopic(c)}
                    className={`block w-full rounded-lg border p-3 text-left transition ${
                      pickedTopic?.title === c.title ? "border-sky-500 bg-sky-950/30" : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"
                    }`}
                  >
                    <span className="text-sm font-medium">{c.title}</span>
                    <span className="mt-1 block text-xs text-zinc-500">{c.reason}</span>
                  </button>
                ))}
                {!rec && <p className="text-sm text-zinc-500">불러오는 중...</p>}
                {rec && (rec.candidates || []).length === 0 && (
                  <p className="text-sm text-zinc-500">지금은 새로 쓸 만한 주제가 없습니다. 고급 설정에서 새로 추천을 만들 수 있습니다.</p>
                )}
              </div>
              <PrimaryButton
                disabled={!pickedTopic || !!busy}
                onClick={() => {
                  setCurrentJobId("__new__");
                  goto(2);
                }}
              >
                이 주제로 시작하기
              </PrimaryButton>
            </>
          )}
        </StepCard>

        {/* ── 2. 제작 요청 파일 받기 ── */}
        <StepCard step={STEPS[1]} status={statusOf(2)} open={open === 2} onOpen={() => goto(2)} onNext={() => goto(3)} nextEnabled={cur > 2}>
          {statusOf(2) === "wait" ? (
            <p className="text-sm text-zinc-500">1번에서 주제를 먼저 고르세요.</p>
          ) : (
            <>
              <p className="text-sm text-zinc-300">
                주제: <b className="text-zinc-100">{job?.topic || pickedTopic?.title}</b>
              </p>
              <ProductLinkPicker
                products={products}
                selected={linkedProductIds}
                onToggle={(id) =>
                  setLinkedProductIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
                }
                alreadyLinked={job?.linkedProducts || []}
                topic={job?.topic || pickedTopic?.title || ""}
              />
              <p className="mt-3 text-sm text-zinc-400">
                버튼을 누르면 요청 파일이 내려받아집니다. 그 파일을 ChatGPT 대화창에 올리고, ChatGPT가 돌려준 파일을 3번에서 등록하세요.
              </p>
              <PrimaryButton disabled={!!busy || !topicForRequest} onClick={getRequestFile}>
                {busy === "step2" ? "만드는 중..." : statusOf(2) === "done" ? "요청 파일 다시 받기" : "제작 요청 파일 받기"}
              </PrimaryButton>
            </>
          )}
          <Note msg={msg} step={2} />
        </StepCard>

        {/* ── 3. 완성 글 파일 등록 ── */}
        <StepCard step={STEPS[2]} status={statusOf(3)} open={open === 3} onOpen={() => goto(3)} onNext={() => goto(4)} nextEnabled={cur > 3}>
          {statusOf(3) === "wait" ? (
            <p className="text-sm text-zinc-500">2번에서 요청 파일을 먼저 받으세요.</p>
          ) : statusOf(3) === "done" ? (
            <p className="text-sm text-emerald-300">완성 글이 이미 등록되어 있습니다. 다시 등록하지 않아도 됩니다.</p>
          ) : (
            <>
              <p className="text-sm text-zinc-400">ChatGPT가 돌려준 파일을 선택하면 이미지 저장과 자동 검수까지 한 번에 처리됩니다.</p>
              <input
                id="finished-file"
                type="file"
                accept="application/json,.json"
                className="hidden"
                disabled={!!busy}
                onChange={(e) => registerFinishedFile(e.target.files?.[0])}
              />
              <label
                htmlFor="finished-file"
                className={`mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white ${
                  busy ? "opacity-40" : "cursor-pointer hover:bg-emerald-500"
                }`}
              >
                {busy === "step3" ? "등록 중..." : "완성 글 파일 선택"}
              </label>
            </>
          )}
          <Note msg={msg} step={3} />
        </StepCard>

        {/* ── 4. 미리보기·검수 ── */}
        <StepCard step={STEPS[3]} status={statusOf(4)} open={open === 4} onOpen={() => goto(4)} onNext={() => goto(5)} nextEnabled={cur > 4}>
          {statusOf(4) === "wait" ? (
            <p className="text-sm text-zinc-500">3번에서 완성 글을 먼저 등록하세요.</p>
          ) : (
            <>
              <p className="text-sm text-zinc-300">
                글 제목: <b className="text-zinc-100">{row?.title || job?.topic}</b>
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                {qaData
                  ? `자동 검수 통과 · 사람이 직접 확인할 항목 ${qaData.needsHumanReview?.length ?? 0}건`
                  : "본문을 열어 내용을 확인하세요."}
              </p>
              {(qaData?.needsHumanReview || []).map((r) => (
                <p key={r.id} className="mt-1 text-xs text-amber-300">● {r.reason}</p>
              ))}
              {job?.articleId && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/writer/${job.articleId}`}
                    className="inline-block rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:text-zinc-100"
                  >
                    본문 미리보기 열기
                  </Link>
                  {/* 글자만 보이는 편집기와 달리, 표·이미지 5장까지 실제로 그려진
                      화면으로 확인한다. 발행 화면의 Local Preview를 그대로 쓴다. */}
                  <Link
                    href={`/publisher?id=${job.articleId}`}
                    className="inline-block rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:text-zinc-100"
                  >
                    이미지 포함 미리보기
                  </Link>
                </div>
              )}
              {statusOf(4) === "done" ? (
                <p className="mt-3 text-sm text-emerald-300">검수와 발행 승인이 끝났습니다.</p>
              ) : (
                <PrimaryButton disabled={!!busy} onClick={approveForPublish}>
                  {busy === "step4" ? "승인 중..." : "검수 완료 · 발행 승인"}
                </PrimaryButton>
              )}
            </>
          )}
          <Note msg={msg} step={4} />
        </StepCard>

        {/* ── 5. 블로그 발행 ── */}
        <StepCard step={STEPS[4]} status={statusOf(5)} open={open === 5} onOpen={() => goto(5)} onNext={() => goto(6)} nextEnabled={cur > 5}>
          {statusOf(5) === "wait" ? (
            <p className="text-sm text-zinc-500">4번에서 발행 승인을 먼저 하세요.</p>
          ) : published ? (
            <>
              <p className="text-sm text-emerald-300">블로그에 발행되었습니다.</p>
              {row?.url && (
                <a href={row.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-sky-300 underline">
                  발행된 글 열기
                </a>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-400">
                승인이 끝났습니다. 발행 화면에서 마지막으로 확인하고 블로그에 올리세요.
              </p>
              <Link
                href="/publisher"
                className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                블로그 발행 화면 열기
              </Link>
            </>
          )}
        </StepCard>

        {/* ── 6. 트래픽 배포 ── */}
        <StepCard step={STEPS[5]} status={statusOf(6)} open={open === 6} onOpen={() => goto(6)} nextEnabled={false}>
          {statusOf(6) === "wait" ? (
            <p className="text-sm text-zinc-500">블로그 발행 후 사용할 수 있습니다.</p>
          ) : (
            <TrafficStep articleId={job?.articleId} />
          )}
        </StepCard>

        {published && (
          <p className="rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
            이 글은 발행까지 끝났습니다. 새 글을 시작하려면 1번에서 “다른 주제로 새 글 시작”을 누르세요.
          </p>
        )}

        {/* ── 고급 설정 / 개발자 정보 (기존 기능 전부 보존) ── */}
        <details className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-400">고급 설정 · 개발자 정보</summary>
          <div className="mt-4 space-y-6">
            <section>
              <h3 className="text-sm font-semibold text-zinc-300">추천 엔진 진단</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <button onClick={refreshRecommendations} disabled={!!busy} className="rounded bg-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50">
                  {busy === "rec" ? "생성 중..." : "새로 추천 생성"}
                </button>
                <span>sourceMode: {rec?.sourceMode || "-"}</span>
                <span>Production {rec?.counts?.production ?? 0} · 제외 {rec?.counts?.rejected ?? 0}</span>
                {rec?.blocked?.map((b) => <span key={b}>{b}</span>)}
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">{rec?.scopeNote}</p>
              {job?.letters && (
                <p className="mt-2 text-[11px] text-fuchsia-300">
                  {/* 저장된 옛 라벨/내부 id 대신 항상 현재 표시 이름으로 보여 준다. */}
                  이 글의 ATLAS Letters {castDisplayLabel(job.letters)} ({job.letters.weekStart}~{job.letters.weekEnd}) · 대표 인물{" "}
                  {characterDisplayName(job.letters.heroCharacterId)}
                </p>
              )}
              {rec?.rejected?.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-zinc-500">중복·범위 제외 후보 {rec.rejected.length}건</summary>
                  <ul className="mt-1 space-y-1 text-[11px] text-zinc-600">
                    {rec.rejected.map((r, i) => (
                      <li key={i}>· {r.topic} — {r.reason} [{r.sourcePool}]</li>
                    ))}
                  </ul>
                </details>
              )}
              {rec?.candidates?.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-zinc-500">후보 점수·축·중복위험</summary>
                  <ul className="mt-1 space-y-1 text-[11px] text-zinc-500">
                    {rec.candidates.map((c) => (
                      <li key={c.priority}>
                        #{c.priority} {c.title} — 점수 {c.score}/{c.maxAvailableScore} · 축 {c.contentAxis?.label} · 중복위험{" "}
                        {c.relation?.duplicationRisk} · {c.moneyHunterId || c.origin}
                        <button onClick={() => autoProduce(c)} disabled={!!busy} className="ml-2 rounded bg-zinc-700 px-1.5 py-0.5 text-zinc-200 disabled:opacity-40">
                          서버 자동 제작
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-zinc-300">제작 Job 원본 (내부 번호·상태)</h3>
              <div className="mt-2 space-y-2">
                {jobs.map((j) => <ProdJobRow key={j.id} job={j} busy={busy} onRetry={retryJob} />)}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-zinc-300">원고 파이프라인 · QA (기존 화면)</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-zinc-500">기존 MASTER로 QA 시작:</span>
                {["art_004", "art_005", "art_006"].map((id) => (
                  <button key={id} onClick={() => startQaForArticle(id)} disabled={!!busy} className="rounded bg-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50">
                    {id}
                  </button>
                ))}
              </div>
              <div className="mt-2 space-y-2">
                {(pipeline?.jobs || []).map((pj) => (
                  <JobCard key={pj.id} job={pj} busy={busy} onAction={jobAction} onMakeShort={makeShort} />
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-zinc-300">쇼핑 쇼츠 · 캠페인</h3>
              <div className="mt-2 space-y-2">
                {shorts.map((d) => <ShortCard key={d.shortId} draft={d} />)}
                {shorts.length === 0 && <p className="text-xs text-zinc-600">쇼츠 초안이 없습니다.</p>}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-zinc-300">실제 성과</h3>
              <div className="mt-2">
                <TrackingPanel tracking={tracking} csv={csv} setCsv={setCsv} onImport={importCsv} busy={busy} />
              </div>
            </section>

            <section className="flex flex-wrap gap-3 text-xs text-zinc-500">
              <Link href="/money-hunter" className="underline hover:text-zinc-200">키워드 DB · 영문 키워드 발굴</Link>
              <Link href="/atlas/publishing" className="underline hover:text-zinc-200">기존 수동 원고 발행</Link>
              <Link href="/publisher" className="underline hover:text-zinc-200">블로그 발행 화면</Link>
            </section>
          </div>
        </details>
      </div>
    </div>
  );
}

function StepCard({ step, status, open, children, onNext, nextEnabled, onOpen }) {
  if (!open) {
    // 접힌 줄도 눌러서 펼 수 있어야 한다. 예전에는 클릭 대상이 위쪽 진행 표시줄
    // 뿐이라, 파란 "진행 중" 줄을 눌러도 아무 반응이 없는 것처럼 보였다.
    const canOpen = status !== "wait" && typeof onOpen === "function";
    return (
      <section className={`rounded-xl border ${STATE_STYLE[status]}`}>
        <button
          type="button"
          onClick={canOpen ? onOpen : undefined}
          disabled={!canOpen}
          className={`flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left ${
            canOpen ? "hover:brightness-125" : "cursor-not-allowed"
          }`}
        >
          <span className="font-mono text-xs">{step.n}</span>
          <h2 className="text-sm font-semibold">{step.title}</h2>
          <span className="ml-auto text-xs">{STATE_LABEL[status]}</span>
        </button>
      </section>
    );
  }
  return (
    <section className={`rounded-xl border bg-zinc-900 p-5 ${status === "wait" ? "border-zinc-800" : status === "done" ? "border-emerald-700" : "border-sky-600"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-1 font-mono text-xs ${status === "done" ? "bg-emerald-600/20 text-emerald-300" : status === "active" ? "bg-sky-600/20 text-sky-200" : "bg-zinc-800 text-zinc-500"}`}>
          {step.n}
        </span>
        <h2 className="text-lg font-semibold">{step.title}</h2>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${status === "done" ? "bg-emerald-500/20 text-emerald-300" : status === "active" ? "bg-sky-500/20 text-sky-200" : "bg-zinc-800 text-zinc-500"}`}>
          {STATE_LABEL[status]}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{step.hint}</p>
      <div className="mt-4">{children}</div>
      {onNext && nextEnabled && (
        <button
          type="button"
          onClick={onNext}
          className="mt-4 w-full rounded-lg border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-950/40 sm:w-auto"
        >
          다음 단계로 →
        </button>
      )}
    </section>
  );
}

function PrimaryButton({ children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 sm:w-auto"
    >
      {children}
    </button>
  );
}

function Note({ msg, step }) {
  if (!msg || msg.step !== step) return null;
  return (
    <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`}>{msg.text}</p>
  );
}

function ProdJobRow({ job, busy, onRetry }) {
  const blockedOrFailed = job.status?.startsWith("BLOCKED") || job.status === "FAILED";
  const reason = job.blocked?.userMessage || job.error?.userMessage || job.review?.userMessage;
  // 중복으로 종료된 작업은 재시도 대상이 아니다 — 같은 글이 이미 발행돼 있으므로
  // 재개하면 중복 원고를 다시 만들게 된다.
  const closedAsDuplicate = Boolean(job.duplicateOf);
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-500">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-zinc-400">{job.id}</span>
        <span className="text-zinc-300">{job.topic}</span>
        <span>{closedAsDuplicate ? `${job.duplicateOf}로 발행 완료된 중복 작업` : job.statusLabel || job.status}</span>
        <span>article {job.articleId || "-"}</span>
        <span>{job.moneyHunterId || "-"}</span>
        {job.resumable && blockedOrFailed && !closedAsDuplicate && (
          <button onClick={() => onRetry(job.id)} disabled={!!busy} className="ml-auto rounded bg-sky-800 px-2 py-0.5 text-sky-100 disabled:opacity-50">
            {busy === "retry" + job.id ? "재시도 중..." : "재시도"}
          </button>
        )}
      </div>
      {reason && <p className="mt-1 text-amber-400">{reason}</p>}
    </div>
  );
}

function JobCard({ job, busy, onAction, onMakeShort }) {
  const info = job.stageInfo || {};
  const adv = job.advance || {};
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{job.topic || job.linkedArticleId}</span>
        <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">{info.label || job.stage}</span>
        <span className="text-[11px] text-zinc-500">다음: {info.next}</span>
      </div>
      {job.qa && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span>자동 QA:</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${job.qa.pass ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
              {job.qa.pass ? "통과" : `실패 ${job.qa.failCount}건`}
            </span>
            <span className="text-zinc-500">{job.qa.publishNote}</span>
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {job.qa.checks.map((c) => (
              <li key={c.id} className="text-[11px] text-zinc-400">
                [{c.status}] <b className="text-zinc-300">{c.label}</b> — {c.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!adv.ok && adv.reason && <p className="mt-2 rounded bg-amber-950/40 px-2 py-1 text-[11px] text-amber-300">다음 단계 잠김: {adv.reason}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={() => onAction(job.id, "advance")} disabled={!!busy || !adv.ok} className="rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-40">
          다음 단계로 →
        </button>
        {job.stage === "ready_for_review" && !job.humanApproved && (
          <button onClick={() => onAction(job.id, "approve")} disabled={!!busy} className="rounded bg-sky-700 px-2 py-1 text-xs text-white hover:bg-sky-600 disabled:opacity-50">
            사람 최종 승인
          </button>
        )}
        {job.stage === "user_approved" && !job.imagesReady && (
          <button onClick={() => onAction(job.id, "imagesReady")} disabled={!!busy} className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50">
            이미지 계획 준비 완료
          </button>
        )}
        {job.linkedArticleId && (
          <button onClick={() => onMakeShort(job.linkedArticleId)} disabled={!!busy} className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50">
            쇼츠 초안 만들기
          </button>
        )}
      </div>
    </div>
  );
}

function ShortCard({ draft }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-zinc-500">{draft.shortId}</span>
        <span className="text-sm font-medium">{draft.hook}</span>
        <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">{draft.mode === "commerce" ? "판매형" : "정보형"}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${draft.isProduction ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
          {draft.isProduction ? "Production" : "Preview"}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{draft.productionNote}</p>
      {!draft.productTieIn.enabled && <p className="mt-1 text-[11px] text-amber-300">{draft.productTieIn.reason}</p>}
      <div className="mt-2 text-[11px] text-zinc-500">
        캠페인:{" "}
        {draft.campaigns.map((c) => (
          <span key={c.campaignId} className="mr-2 inline-block">
            {c.platform}=<span className="font-mono text-zinc-400">{c.campaignId}</span> {c.trackedUrlStatus}
          </span>
        ))}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-emerald-400">MagicLight 프롬프트 · 플랫폼 카피 보기</summary>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[11px] text-zinc-400">{draft.magicLightPrompt}</pre>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {Object.entries(draft.platforms).map(([p, v]) => (
            <div key={p} className="rounded border border-zinc-800 p-2 text-[11px]">
              <b className="text-zinc-300">{p}</b>
              <p className="text-zinc-400">{v.title}</p>
              <p className="text-zinc-600">{v.hashtags.join(" ")}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function TrackingPanel({ tracking, csv, setCsv, onImport, busy }) {
  if (!tracking) return <p className="text-xs text-zinc-600">불러오는 중...</p>;
  const ns = tracking.networkStatus || {};
  const d = tracking.dashboard || {};
  const t = d.totals || {};
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-[11px] text-zinc-500">
        <span>제휴 승인: {ns.affiliateApproval}</span>
        <span>공개 추적: {ns.publicTracking}</span>
        <span>Impact API: {ns.apiSync?.impact}</span>
        <span>VisitorsCoverage: {ns.apiSync?.visitorsCoverage}</span>
        <span>활성 상품: {ns.activeProductCount}</span>
      </div>
      <p className="rounded bg-amber-950/40 px-2 py-1 text-[11px] text-amber-300">{ns.note}</p>
      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {[
          ["실제 클릭", t.clicks],
          ["주문", t.orders],
          ["판매 수량", t.units],
          ["매출", t.revenue],
          ["확정 수수료", t.confirmedCommission],
          ["대기 수수료", t.pendingCommission],
          ["전환율", t.conversionRate],
          ["Production 캠페인", d.productionCampaignCount],
        ].map(([label, val]) => (
          <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
            <p className="text-[11px] text-zinc-500">{label}</p>
            <p className="text-sm font-semibold">{val === undefined || val === null ? "-" : String(val)}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-zinc-500">
        <span>
          상태분리 — 대기 {t.statusCounts?.pending ?? 0} · 승인 {t.statusCounts?.approved ?? 0} · 취소 {t.statusCounts?.reversed ?? 0} · 환불{" "}
          {t.statusCounts?.refunded ?? 0}
        </span>
        <span>데이터 출처: {d.dataSource}</span>
        <span>마지막 동기화: {d.lastSyncAt || "없음"}</span>
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-emerald-400">공식 CSV 리포트 import (fallback)</summary>
        <p className="mt-2 text-[11px] text-zinc-500">헤더 예: actionId,campaignId,status,units,revenue,commission,isTest — 중복 actionId는 자동 제외됩니다.</p>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="actionId,campaignId,status,units,revenue,commission"
          className="mt-2 h-24 w-full rounded border border-zinc-700 bg-black/40 p-2 font-mono text-[11px]"
        />
        <button onClick={onImport} disabled={!!busy || !csv.trim()} className="mt-2 rounded bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50">
          {busy === "csv" ? "가져오는 중..." : "CSV 가져오기"}
        </button>
        {tracking.imports?.length > 0 && (
          <p className="mt-2 text-[11px] text-zinc-500">
            최근 import: 추가 {tracking.imports.at(-1).added} · 중복제외 {tracking.imports.at(-1).skippedDuplicates} · 거부 {tracking.imports.at(-1).rejected}
          </p>
        )}
      </details>
    </div>
  );
}


// ── 블로그에 연결할 Product Center 상품 고르기 ──────────────────────────────
// 상품이 있어도 반드시 골라야 실린다. 제휴 링크가 없으면 "제휴 링크 대기"를 그대로
// 보여 주고, 가짜 링크는 어디서도 만들지 않는다.
function ProductLinkPicker({ products, selected, onToggle, alreadyLinked, topic = "" }) {
  // Travel Wellness & Everyday Fitness 글이면, 이 주제에 실제로 맞는 상품만
  // 골라 "추천"으로 표시한다. 목록을 자르거나 자동 선택하지는 않는다 — 무엇을
  // 실을지는 끝까지 사람이 정한다.
  const wellness = isWellnessText(topic);
  const recommendedIds = useMemo(() => {
    if (!wellness) return new Set();
    return new Set(suggestProductsForTopic(topic, products).filter((m) => m.recommended).map((m) => m.productId));
  }, [wellness, topic, products]);
  const hints = wellness ? suggestProductCategories(topic) : [];

  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-xs font-semibold text-zinc-300">이 글에 연결할 상품 (Product Center)</p>
      {wellness && (
        <p className="mt-1 text-[11px] text-sky-300">
          이 주제와 어울리는 제품군: {hints.join(", ")} — 정보를 먼저 주고 마지막에 자연스럽게 잇습니다.
        </p>
      )}
      <p className="mt-1 text-[11px] text-zinc-500">
        고른 상품은 이름·카테고리·상품 URL·가격 근거·확인 시각·핵심 효용·주요 특징·이미지 참조가 요청 파일에
        스냅샷으로 들어갑니다. 글은 상품 광고문이 아니라 독자의 질문을 먼저 해결한 뒤 제품을 잇는 형식이어야 합니다.
      </p>

      {alreadyLinked.length ? (
        <p className="mt-2 text-[11px] text-emerald-400">
          이미 이 글에 연결된 상품: {alreadyLinked.map((p) => p.name).join(", ")}
        </p>
      ) : null}

      <ul className="mt-2 space-y-1">
        {products.map((p) => {
          const affiliate = affiliateState(p);
          return (
            <li key={p.id}>
              <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={() => onToggle(p.id)}
                  className="mt-0.5"
                />
                <span>
                  <b className="text-zinc-100">{p.name}</b>
                  {recommendedIds.has(p.id) && (
                    <span className="ml-1 rounded bg-sky-500/20 px-1 py-0.5 text-sky-300">이 주제에 추천</span>
                  )}
                  <span className="text-zinc-500">
                    {p.category ? ` · ${p.category}` : ""}
                    {p.currentPrice === null || p.currentPrice === undefined
                      ? " · 가격 미확인"
                      : ` · ${formatAmount(p.currentPrice, p.currency)}`}
                  </span>
                  <span
                    className={`ml-1 rounded px-1 py-0.5 ${
                      affiliate.mayRenderBuyButton ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {affiliate.label}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
        {products.length === 0 && (
          <li className="text-xs text-zinc-500">
            Product Center에 등록된 상품이 없습니다.{" "}
            <Link href="/atlas/product-center" className="text-emerald-400 hover:underline">
              상품 등록하러 가기
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
