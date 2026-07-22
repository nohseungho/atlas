"use client";

import { useEffect, useState } from "react";

// ─── ATLAS Revenue Automation R2 — one screen, one flow ──────────────────────
// 이번 주 자동추천 → 주제 선택 → 원고 생성 → QA → 미리보기 → 승인·발행
//  → 쇼핑 쇼츠 초안 → 캠페인 링크 → 실제 성과
// 개발 용어 대신 각 단계의 현재 상태 / 다음 행동 / 실패 이유를 한글로 표시한다.

const STATUS_STYLE = {
  PASS: "bg-emerald-500/20 text-emerald-300",
  FAIL: "bg-red-500/20 text-red-300",
  WARN: "bg-amber-500/20 text-amber-300",
  NA: "bg-zinc-700 text-zinc-300",
  NEEDS_CONFIGURATION: "bg-sky-500/20 text-sky-300",
  UNKNOWN: "bg-zinc-700 text-zinc-400",
};

function Pill({ status, children }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] || "bg-zinc-700 text-zinc-300"}`}>
      {children || status}
    </span>
  );
}

function Section({ step, title, subtitle, children }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-baseline gap-3">
        <span className="rounded-md bg-emerald-600/20 px-2 py-1 font-mono text-xs text-emerald-300">{step}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

async function api(url, options) {
  const res = await fetch(url, { cache: "no-store", ...options });
  return res.json().catch(() => ({}));
}

export default function RevenuePage() {
  const [rec, setRec] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [shorts, setShorts] = useState([]);
  const [tracking, setTracking] = useState(null);
  const [busy, setBusy] = useState("");
  const [csv, setCsv] = useState("");

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
    }
    loadAll();
  }, []);

  async function refreshRecommendations() {
    setBusy("rec");
    setRec(await api("/api/atlas/recommendations?fresh=1"));
    setBusy("");
  }

  async function selectTopic(candidate) {
    setBusy("select");
    await api("/api/atlas/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recommendation: candidate }),
    });
    setPipeline(await api("/api/atlas/pipeline"));
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

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold">수익 자동화 (Revenue R2)</h1>
          <p className="mt-1 text-sm text-zinc-400">
            자동추천 → 원고·QA → 승인·발행 → 쇼핑 쇼츠 → 캠페인 → 실제 성과. 한 화면에서 전체 흐름을 확인합니다.
          </p>
          <p className="mt-2 rounded-lg border border-sky-900 bg-sky-950/30 px-3 py-2 text-xs text-sky-300">
            정직성 원칙: 실시간 트렌드·경쟁도·실제 클릭/주문/매출은 외부 연동이 확인되기 전까지 UNKNOWN 또는 BLOCKED로
            표시하며, 추측값을 실제 데이터처럼 보여주지 않습니다.
          </p>
        </header>

        {/* ── 1. 이번 주 자동추천 ── */}
        <Section
          step="1"
          title={rec?.sourceMode === "LIVE" ? "이번 주 자동추천 (실시간)" : "이번 주 편집 추천 (실시간 트렌드 미연결)"}
          subtitle={rec ? `축: 여행보험·여행 안전 클러스터 · Production ${rec.counts?.production ?? 0}건 · 제외 ${rec.counts?.rejected ?? 0}건` : ""}
        >
          {rec && rec.sourceMode !== "LIVE" && (
            <p className="mb-3 rounded-lg border border-amber-900 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
              실시간 트렌드 연결 안 됨 · 현재 후보는 <b>ATLAS 편집 기준(EDITORIAL_FALLBACK)</b> 기반이며 실제 트렌드·검색량으로
              검증되지 않았습니다. {rec.scopeNote}
            </p>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button onClick={refreshRecommendations} disabled={!!busy} className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600 disabled:opacity-50">
              {busy === "rec" ? "생성 중..." : "새로 추천 생성"}
            </button>
            <Pill status={rec?.sourceMode === "LIVE" ? "PASS" : "NEEDS_CONFIGURATION"}>{rec?.sourceMode || "..."}</Pill>
            {rec?.blocked?.map((b) => <Pill key={b} status="NEEDS_CONFIGURATION">{b}</Pill>)}
          </div>
          <div className="space-y-2">
            {(rec?.candidates || []).map((c) => (
              <div key={c.priority} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-zinc-500">#{c.priority}</span>
                  <span className="font-medium">{c.title}</span>
                  <Pill status="NA">{c.type}</Pill>
                  <span className="text-xs text-zinc-500">점수 {c.score}/{c.maxAvailableScore}</span>
                  <button
                    onClick={() => selectTopic(c)}
                    disabled={!!busy || !c.eligibility?.canGenerate}
                    title={c.eligibility?.blockedReason || ""}
                    className="ml-auto rounded bg-emerald-600 px-2 py-1 text-xs hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {c.eligibility?.canGenerate ? "이 주제로 원고 시작" : "원고 생성 차단"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-zinc-500">의도: {c.searchIntent}</p>
                <p className="mt-1 text-xs text-zinc-400">{c.reason}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                  <span>축: <Pill status="NA">{c.contentAxis?.label}</Pill></span>
                  <span>출처모드: <Pill status={c.sourceMode === "LIVE" ? "PASS" : "NEEDS_CONFIGURATION"}>{c.sourceMode}</Pill></span>
                  <span>트렌드: <Pill status="UNKNOWN">{c.trend?.sevenDay}</Pill></span>
                  <span>경쟁도: <Pill status="UNKNOWN">{c.competition?.live}</Pill></span>
                  <span>중복위험: <Pill status={c.relation?.duplicationRisk === "HIGH" ? "FAIL" : c.relation?.duplicationRisk === "MEDIUM" ? "WARN" : "PASS"}>{c.relation?.duplicationRisk}</Pill>{c.relation?.overlappingArticleIds?.length ? ` (${c.relation.overlappingArticleIds.join(",")})` : ""}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                  <span>클러스터: {c.relation?.clusterRole}</span>
                  <span>근거: {c.officialSource?.availability}</span>
                  <span>제휴: <Pill status="NEEDS_CONFIGURATION">{c.monetization?.affiliateReadiness}</Pill></span>
                  <span>향후 상품군: {(c.monetization?.futureProductCategories || []).join(", ") || "-"}</span>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-emerald-400">점수 계산 근거</summary>
                  <p className="text-[11px] text-zinc-500">
                    {Object.entries(c.scoreBreakdown || {}).map(([k, v]) => `${k} ${v}`).join(" · ")}
                    {(c.excludedComponents || []).length ? ` · 제외: ${c.excludedComponents.map((e) => `${e.component}(${e.reason})`).join(", ")}` : ""}
                  </p>
                </details>
                {!c.eligibility?.canGenerate && <p className="mt-1 text-[11px] text-red-300">{c.eligibility?.blockedReason}</p>}
              </div>
            ))}
            {!rec && <p className="text-sm text-zinc-500">불러오는 중...</p>}
          </div>
          {rec?.rejected?.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-zinc-500">범위 밖 제외 후보 {rec.rejected.length}건 (Production에서 차단됨)</summary>
              <ul className="mt-2 space-y-1 text-[11px] text-zinc-600">
                {rec.rejected.map((r, i) => (
                  <li key={i}>· <span className="text-zinc-400">{r.topic}</span> — {r.reason} <span className="text-zinc-700">[{r.sourcePool}]</span></li>
                ))}
              </ul>
            </details>
          )}
        </Section>

        {/* ── 2~6. 원고 파이프라인 + QA + 승인 ── */}
        <Section step="2~6" title="원고 파이프라인 · QA · 승인" subtitle="추천 선택분과, 기존 MASTER(art_004~006)를 QA에 연결해 검증할 수 있습니다.">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-500">기존 MASTER로 QA 시작:</span>
            {["art_004", "art_005", "art_006"].map((id) => (
              <button key={id} onClick={() => startQaForArticle(id)} disabled={!!busy} className="rounded bg-zinc-700 px-2 py-1 hover:bg-zinc-600 disabled:opacity-50">
                {id}
              </button>
            ))}
            {pipeline?.providerReadiness && (
              <span className="ml-auto">원고 자동생성 제공자: <Pill status={pipeline.providerReadiness.ready ? "PASS" : "NEEDS_CONFIGURATION"}>{pipeline.providerReadiness.status}</Pill></span>
            )}
          </div>
          <div className="space-y-3">
            {(pipeline?.jobs || []).map((job) => (
              <JobCard key={job.id} job={job} busy={busy} onAction={jobAction} onMakeShort={makeShort} />
            ))}
            {pipeline && pipeline.jobs.length === 0 && <p className="text-sm text-zinc-500">아직 파이프라인 작업이 없습니다. 위에서 주제를 선택하거나 MASTER를 연결하세요.</p>}
          </div>
        </Section>

        {/* ── 7~8. 쇼핑 쇼츠 초안 + 캠페인 ── */}
        <Section step="7~8" title="쇼핑 쇼츠 초안 · 캠페인 링크" subtitle="발행 성공 시 자동 생성됩니다. 미발행 글은 Preview 전용(Production 집계 제외).">
          <div className="space-y-3">
            {shorts.map((d) => <ShortCard key={d.shortId} draft={d} />)}
            {shorts.length === 0 && <p className="text-sm text-zinc-500">쇼츠 초안이 없습니다. 파이프라인 카드에서 “쇼츠 초안 만들기”를 누르거나 글을 발행하세요.</p>}
          </div>
        </Section>

        {/* ── 9. 실제 성과 대시보드 ── */}
        <Section step="9" title="실제 성과 대시보드" subtitle="주문·판매량·매출은 제휴 네트워크가 보고한 conversion만 집계합니다. 클릭으로 주문을 추정하지 않습니다.">
          <TrackingPanel tracking={tracking} csv={csv} setCsv={setCsv} onImport={importCsv} busy={busy} />
        </Section>
      </div>
    </div>
  );
}

function JobCard({ job, busy, onAction, onMakeShort }) {
  const info = job.stageInfo || {};
  const adv = job.advance || {};
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{job.topic || job.linkedArticleId}</span>
        <Pill status="NA">{info.label || job.stage}</Pill>
        <span className="text-xs text-zinc-500">다음: {info.next}</span>
        {job.linkedArticleId && <span className="text-[11px] text-zinc-600">({job.linkedArticleId})</span>}
      </div>

      {job.qa && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span>자동 QA:</span>
            <Pill status={job.qa.pass ? "PASS" : "FAIL"}>{job.qa.pass ? "통과" : `실패 ${job.qa.failCount}건`}</Pill>
            <span className="text-zinc-500">{job.qa.publishNote}</span>
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {job.qa.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-[11px] text-zinc-400">
                <Pill status={c.status}>{c.status}</Pill>
                <span><b className="text-zinc-300">{c.label}</b> — {c.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!adv.ok && adv.reason && (
        <p className="mt-2 rounded bg-amber-950/40 px-2 py-1 text-[11px] text-amber-300">다음 단계 잠김: {adv.reason}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={() => onAction(job.id, "advance")} disabled={!!busy || !adv.ok} className="rounded bg-emerald-600 px-2 py-1 text-xs hover:bg-emerald-500 disabled:opacity-40">
          다음 단계로 →
        </button>
        {job.stage === "ready_for_review" && !job.humanApproved && (
          <button onClick={() => onAction(job.id, "approve")} disabled={!!busy} className="rounded bg-sky-600 px-2 py-1 text-xs hover:bg-sky-500 disabled:opacity-50">
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
        <span className="font-medium">{draft.hook}</span>
        <Pill status={draft.mode === "commerce" ? "PASS" : "NA"}>{draft.mode === "commerce" ? "판매형" : "정보형"}</Pill>
        <Pill status={draft.isProduction ? "PASS" : "WARN"}>{draft.isProduction ? "Production" : "Preview"}</Pill>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{draft.productionNote}</p>
      {!draft.productTieIn.enabled && (
        <p className="mt-1 text-[11px] text-amber-300">{draft.productTieIn.reason}</p>
      )}
      <div className="mt-2 text-[11px] text-zinc-500">
        캠페인:{" "}
        {draft.campaigns.map((c) => (
          <span key={c.campaignId} className="mr-2 inline-block">
            {c.platform}=<span className="font-mono text-zinc-400">{c.campaignId}</span> <Pill status="NEEDS_CONFIGURATION">{c.trackedUrlStatus}</Pill>
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
  if (!tracking) return <p className="text-sm text-zinc-500">불러오는 중...</p>;
  const ns = tracking.networkStatus || {};
  const d = tracking.dashboard || {};
  const t = d.totals || {};
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <span>제휴 승인: <Pill status={ns.affiliateApproval === "APPROVED" ? "PASS" : "FAIL"}>{ns.affiliateApproval}</Pill></span>
        <span>공개 추적: <Pill status="FAIL">{ns.publicTracking}</Pill></span>
        <span>Impact API: <Pill status={ns.apiSync?.impact?.startsWith("READY") ? "PASS" : "NEEDS_CONFIGURATION"}>{ns.apiSync?.impact}</Pill></span>
        <span>VisitorsCoverage: <Pill status="NEEDS_CONFIGURATION">{ns.apiSync?.visitorsCoverage}</Pill></span>
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
        <span>상태분리 — 대기 {t.statusCounts?.pending ?? 0} · 승인 {t.statusCounts?.approved ?? 0} · 취소 {t.statusCounts?.reversed ?? 0} · 환불 {t.statusCounts?.refunded ?? 0}</span>
        <span>데이터 출처: {d.dataSource}</span>
        <span>마지막 동기화: {d.lastSyncAt || "없음"}</span>
      </div>

      <details>
        <summary className="cursor-pointer text-xs text-emerald-400">공식 CSV 리포트 import (fallback)</summary>
        <p className="mt-2 text-[11px] text-zinc-500">헤더 예: actionId,campaignId,status,units,revenue,commission,isTest — 중복 actionId는 자동 제외, 실제 네트워크 데이터만 인정됩니다.</p>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="actionId,campaignId,status,units,revenue,commission&#10;A100,c__art-004__...,approved,1,120,12" className="mt-2 h-24 w-full rounded border border-zinc-700 bg-black/40 p-2 font-mono text-[11px]" />
        <button onClick={onImport} disabled={!!busy || !csv.trim()} className="mt-2 rounded bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50">
          {busy === "csv" ? "가져오는 중..." : "CSV 가져오기"}
        </button>
        {tracking.imports?.length > 0 && (
          <p className="mt-2 text-[11px] text-zinc-500">최근 import: 추가 {tracking.imports.at(-1).added} · 중복제외 {tracking.imports.at(-1).skippedDuplicates} · 거부 {tracking.imports.at(-1).rejected}</p>
        )}
      </details>
    </div>
  );
}
