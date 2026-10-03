"use client";

// ATLAS 단일 운영 화면.
// 국내(수호)·해외(미지)를 각각 한 화면에서
// 주제 선택 → 자동 작성 → 이미지 생성 → 미리보기 → 발행 → 공개 URL 확인 순서로 끝낸다.
//
// 발행은 기존에 검증된 경로를 그대로 호출한다.
//   국내: /api/atlas/korea-publish
//   해외: /api/atlas/publisher-approval → /api/publish
// 이 화면은 그 앞 단계와 게이트 표시를 담당한다.

import { useCallback, useEffect, useRef, useState } from "react";
import { KEYS, readList } from "@/app/atlas/lib/storage";
import { listImages } from "@/app/atlas/lib/image-store";

const KOREA = "korea_naver";
const GLOBAL = "global_blogger";

const CHANNELS = [
  { id: KOREA, label: "국내", character: "수호", note: "Naver who-ami · 생활 장면형" },
  { id: GLOBAL, label: "해외", character: "미지", note: "Blogger atlas-money-2026 · 미지 이미지 5장 이상" },
];

const STEPS = ["주제 선택", "제작", "검수", "발행"];

const primary = "rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40";
const secondary = "rounded-lg border border-zinc-600 px-3 py-2.5 text-sm font-medium text-zinc-200 disabled:opacity-40";
const danger = "rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40";

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function StepRail({ current }) {
  return (
    <ol className="flex flex-wrap gap-1.5 text-xs">
      {STEPS.map((label, index) => {
        const n = index + 1;
        const done = current > n;
        const active = current === n;
        return (
          <li
            key={label}
            className={`rounded-full px-3 py-1.5 font-medium ${
              active ? "bg-emerald-600 text-white" : done ? "bg-emerald-950 text-emerald-300" : "bg-zinc-800 text-zinc-500"
            }`}
          >
            {n}. {label}
          </li>
        );
      })}
    </ol>
  );
}

function PolicyBadges({ policy }) {
  if (!policy?.results?.length) return null;
  const tone = { pass: "bg-emerald-950 text-emerald-300", fail: "bg-red-950 text-red-300", warn: "bg-amber-950 text-amber-300", skip: "bg-zinc-800 text-zinc-500" };
  const label = { pass: "PASS", fail: "차단", warn: "검토", skip: "—" };
  return (
    <ul className="flex flex-wrap gap-1.5 text-[11px]">
      {policy.results.map((r) => (
        <li key={r.id} title={r.detail || r.code} className={`rounded px-1.5 py-0.5 ${tone[r.status] || tone.skip}`}>
          {label[r.status] || "—"} · {r.code}
        </li>
      ))}
    </ul>
  );
}

function TopicPicker({ topics, busy, onPick }) {
  return (
    <div className="space-y-2">
      {topics.map((topic) => (
        <div key={topic.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                {topic.inSeason ? <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-emerald-300">제철 주제</span> : null}
                <span>{topic.keyword}</span>
              </div>
              <div className="mt-1 font-semibold">{topic.title}</div>
              {topic.blockedReason ? <div className="mt-1 text-xs text-amber-300">{topic.blockedReason}</div> : null}
            </div>
            <button type="button" className={primary} disabled={busy || Boolean(topic.blockedReason)} onClick={() => onPick(topic.id)}>
              이 주제로 작성
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ImagePanel({ images }) {
  if (!images) return null;
  const done = images.total > 0 && images.ready === images.total;
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">이미지 준비 상태</div>
          <div className={`mt-1 text-sm ${done ? "text-emerald-300" : "text-amber-300"}`}>
            캐릭터 이미지 {images.ready}/{images.total} 생성 완료
            {images.productPhotoTotal
              ? ` · 실제 제품 사진 ${images.productPhotoReady}/${images.productPhotoTotal} 연결`
              : ""}
          </div>
          {images.missing?.length ? <div className="mt-1 text-xs text-zinc-500">대기: {images.missing.join(", ")}</div> : null}
        </div>

      </div>
    </section>
  );
}

export default function OperatePage() {
  const [state, setState] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [actionFailed, setActionFailed] = useState(false);
  const [result, setResult] = useState(null);
  const [reviewCode, setReviewCode] = useState("");
  const [choosingTopic, setChoosingTopic] = useState(false);
  const [productUrl, setProductUrl] = useState("");
  const [savedProducts, setSavedProducts] = useState([]);
  const [generator, setGenerator] = useState(null);
  const [connectingEngine, setConnectingEngine] = useState(false);
  const autoConnectAttempted = useRef(false);
  const [approvals, setApprovals] = useState(null);
  // 준비된 원고가 여러 개일 때 화면이 보고 있는 항목. 비어 있으면 가장 최근 것.
  const [picked, setPicked] = useState({ [KOREA]: "", [GLOBAL]: "" });

  const load = useCallback(async (selection) => {
    const query = new URLSearchParams();
    if (selection?.[KOREA]) query.set("koreaId", selection[KOREA]);
    if (selection?.[GLOBAL]) query.set("globalId", selection[GLOBAL]);
    const res = await fetch(`/api/atlas/operate?${query}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (data.status === "ok") { setState(data.state); setGenerator(data.generator); setApprovals(data.approvals); setRuntime(data.runtime || null); }
    else setMessage(data.error || "운영 상태를 읽지 못했습니다.");
  }, []);

  useEffect(() => {
    // 자체 API 로드. 선택이 바뀌면 그 항목 기준으로 다시 읽는다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(picked);
  }, [load, picked]);

  const connectGenerator = useCallback(async () => {
    setConnectingEngine(true);
    try {
      const { ok, data } = await postJson("/api/atlas/operate", { action: "connectImageEngine" });
      if (!ok) throw new Error(data.error || "이미지 엔진을 시작하지 못했습니다.");
      setGenerator(data.generator);
    } catch (error) {
      setGenerator({ ready: false, installed: true, message: String(error?.message || error) });
    } finally { setConnectingEngine(false); }
  }, []);

  useEffect(() => {
    if (generator?.installed && !generator.ready && !autoConnectAttempted.current) {
      autoConnectAttempted.current = true;
      // 바탕화면 앱이 브라우저만 열어도 PC의 ComfyUI를 한 번 자동 시작한다.
      void connectGenerator();
    }
  }, [generator, connectGenerator]);

  useEffect(() => {
    let live = true;
    Promise.all(readList(KEYS.products).map(async (product) => ({ ...product, localImages: await listImages(product.id).catch(() => []) })))
      .then((products) => { if (live) setSavedProducts(products.filter((product) => product.productUrl)); });
    return () => { live = false; };
  }, []);

  async function run(label, fn) {
    setBusy(label);
    setMessage("");
    setActionFailed(false);
    try {
      await fn();
    } catch (error) {
      setActionFailed(true);
      setMessage(String(error?.message || error));
      await load(picked).catch(() => {});
    } finally {
      setBusy("");
    }
  }

  function act(body, note) {
    return run(body.action, async () => {
      const selection = { koreaId: picked[KOREA], globalId: picked[GLOBAL] };
      const { ok, data } = await postJson("/api/atlas/operate", { ...selection, ...body });
      if (data.state) setState(data.state);
      if (!ok) throw new Error(data.error || "처리하지 못했습니다.");
      if (data.id) { setPicked((prev) => ({ ...prev, [body.channelId]: data.id })); setChoosingTopic(false); }
      if (body.action === "images") await load({ ...picked, [body.channelId]: data.id });
      setMessage([note, data.generatorError, data.missing?.length ? `빠진 장면: ${data.missing.join(", ")}` : ""].filter(Boolean).join(" "));
    });
  }

  async function prepareContent() {
    await run("prepareContent", async () => {
      const selection = { koreaId: picked[KOREA], globalId: picked[GLOBAL] };
      // Preserve finished writing and images; retry only the missing production step.
      const actions = [!steps.written && "write", !steps.imagesDone && "images"].filter(Boolean);
      for (const action of actions) {
        const { ok, data } = await postJson("/api/atlas/operate", {
          ...selection, action, channelId: active, id: record.id, force: false,
        });
        if (data.state) setState(data.state);
        if (!ok) throw new Error(data.error || "제작을 완료하지 못했습니다.");
        if (data.generatorError || data.missing?.length) {
          throw new Error([data.generatorError, data.missing?.length ? `빠진 장면: ${data.missing.join(", ")}` : ""].filter(Boolean).join(" "));
        }
      }
      await load(picked);
      setMessage("제작 상태를 확인했습니다. 아래 미리보기에서 글과 모든 이미지를 검수하세요.");
    });
  }

  async function downloadReview(record, channel) {
    await run("downloadReview", async () => {
      const doc = new DOMParser().parseFromString(channel.preview?.html || "", "text/html");
      const images = [...doc.images];
      if (!images.length) throw new Error("이미지가 준비된 뒤 검수 파일을 저장할 수 있습니다.");
      for (const img of images) {
        const src = new URL(img.getAttribute("src") || "", window.location.href);
        if (src.protocol !== "https:" && src.origin !== window.location.origin) throw new Error("이미지 주소를 확인할 수 없습니다.");
        const response = await fetch(src);
        if (!response.ok) throw new Error(`검수 파일에 이미지 ${images.indexOf(img) + 1}장을 담지 못했습니다.`);
        const blob = await response.blob();
        img.src = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("이미지 파일을 읽지 못했습니다."));
          reader.readAsDataURL(blob);
        });
      }
      const heading = doc.createElement("h1");
      heading.textContent = record.title;
      doc.body.prepend(heading);
      const style = doc.createElement("style");
      style.textContent = "body{max-width:850px;margin:40px auto;padding:0 20px;font:16px/1.8 sans-serif;color:#171717}img{display:block;max-width:100%;height:auto;margin:24px auto}h1,h2,h3{line-height:1.35}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #bbb;padding:8px}";
      doc.head.append(style);
      const review = channel.review;
      const meta = doc.createElement("meta");
      meta.name = "atlas-review";
      meta.content = JSON.stringify({ id: record.id, channel: review.channel, contentHash: review.contentHash,
        approvedVersion: review.approvedVersion, finalReviewHash: review.finalReviewHash, placements: channel.preview?.placements || [],
        checks: review.blocking, imageCount: images.length, images: review.images,
        character: isKorea ? "suho" : "miji", faceThreshold: isKorea ? null : 0.5,
        receiptFormat: "ATLAS-REVIEW:<finalReviewHash>:PASS",
        reviewerInstruction: "Inspect the entire article and every image: character identity, natural scenes, distinct composition, exact anchors, claims, sources, and reader prose. Return the receipt only if all checks pass. This receipt never authorizes publication." });
      doc.head.append(meta);
      doc.title = record.title;
      const url = URL.createObjectURL(new Blob(["<!doctype html>\n", doc.documentElement.outerHTML], { type: "text/html;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `ATLAS-review-${record.id}.html`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage(`본문과 이미지 ${images.length}장을 한 파일로 저장했습니다. 이 파일 하나만 보내 검수를 요청할 수 있습니다.`);
    });
  }

  async function refreshToday() {
    await run("refreshToday", async () => {
      const { ok, data } = await postJson("/api/atlas/operate", { action: "refreshToday", channelId: active });
      if (!ok) throw new Error(data.error || "오늘 자료를 갱신하지 못했습니다.");
      setPicked({ [KOREA]: "", [GLOBAL]: "" });
      setChoosingTopic(true);
      await load({ [KOREA]: "", [GLOBAL]: "" });
      setMessage([
        data.synchronized ? `네이버에서 확인된 기존 글 ${data.synchronized}개를 게시 기록에 반영했습니다.` : "",
        data.feedAvailable ? "네이버 게시 기록 확인 완료." : "네이버 공개 글 확인에 실패했습니다. 기존 글의 재게시를 피하세요.",
        data.offerAvailable ? "오늘의 국내 제품 후보를 갱신했습니다." : "국내 상품 출처에 연결하지 못해 오늘의 제품 후보를 확인할 수 없습니다.",
      ].filter(Boolean).join(" "));
    });
  }

  // 최종 검수 화면에서 사용자가 "발행"을 눌렀을 때만 승인이 남는다. 발행 API는 이 승인 없이는
  // Naver/Blogger를 부르지 않는다(자동 발행 금지). 화면이 본 contentHash를 그대로 보낸다.
  async function approvePublish(channelId, id) {
    const review = state?.[channelId]?.review;
    if (!review || review.id !== id) throw new Error("최종 검수 정보를 불러오지 못했습니다. 새로고침하세요.");
    if (review.blocking.length) throw new Error(review.blocking[0]);
    const ok = window.confirm(`아래 글을 실제로 공개합니다.

${review.title}

제목·요약·이미지 ${review.images.length}장·최근 글 비교를 확인했으면 [확인]을 누르세요.`);
    if (!ok) throw new Error("발행을 취소했습니다.");
    const { data } = await postJson("/api/atlas/operate", { action: "approvePublish", channelId, id, contentHash: review.contentHash, confirm: "발행" });
    if (data.status !== "ok") throw new Error(data.error || "발행 승인이 거절되었습니다.");
  }

  async function stageKorea() {
    await run("stage", async () => {
      const draft = state?.[KOREA]?.draft;
      if (!draft) throw new Error("검증할 국내 초안이 없습니다.");
      const { ok, data } = await postJson("/api/atlas/korea-publish", { id: draft.id, mode: "stage" });
      if (!ok || data.status !== "staged") throw new Error(data.error || data.message || "네이버 편집기 검증에 실패했습니다.");
      await load(picked);
      setMessage("네이버 편집기에 글과 이미지를 배치하고 순서를 검증했습니다. 실제 발행은 하지 않았습니다. Edge에서 본문을 확인할 수 있습니다.");
    });
  }

  async function publishKorea() {
    await run("publish", async () => {
      const draft = state?.[KOREA]?.draft;
      if (!draft) throw new Error("발행할 국내 초안이 없습니다.");
      await approvePublish(KOREA, draft.id);
      const { ok, data } = await postJson("/api/atlas/korea-publish", { id: draft.id, mode: "publish" });
      if (!ok) throw new Error(data.error || "네이버 발행 실패");
      if (data.status === "login_required") {
        setMessage("열린 Edge 창에서 네이버 로그인을 마친 뒤 같은 버튼을 다시 누르면 이어서 발행합니다.");
        return;
      }
      setResult({ channel: KOREA, url: data.publishedUrl || "" });
      setMessage("네이버 발행 완료.");
      setPicked((prev) => ({ ...prev, [KOREA]: "" }));
      await load({ ...picked, [KOREA]: "" });
    });
  }

  async function publishGlobal() {
    await run("publish", async () => {
      const article = state?.[GLOBAL]?.article;
      if (!article) throw new Error("발행할 해외 원고가 없습니다.");
      await approvePublish(GLOBAL, article.id);
      const { data } = await postJson("/api/publish", { articleId: article.id, blogId: "blog_001" });
      if (["succeeded", "linked_existing", "published"].includes(data.status)) {
        setResult({ channel: GLOBAL, url: data.publishedUrl || "" });
        setMessage(data.status === "succeeded"
          ? "Blogger 발행 완료."
          : "같은 글이 이미 공개되어 있어 새로 만들지 않고 연결했습니다.");
        setPicked((prev) => ({ ...prev, [GLOBAL]: "" }));
        await load({ ...picked, [GLOBAL]: "" });
        return;
      }
      throw new Error(data.error || `발행 실패 (${data.status || data.errorCode || "오류"})`);
    });
  }

  async function uploadPublicImages() {
    await run("public", async () => {
      const article = state?.[GLOBAL]?.article;
      if (!article) throw new Error("해외 원고가 없습니다.");
      const { data } = await postJson("/api/articles/upload-visuals", { articleId: article.id, mode: "prepare" });
      if (data.errorCode === "CLOUDINARY_CONFIG_MISSING") {
        throw new Error("공개 이미지 호스팅이 설정되지 않았습니다(.env.local의 CLOUDINARY_URL). 설정 후 다시 누르면 5장이 공개 URL로 연결됩니다.");
      }
      setMessage(`공개 이미지 연결 완료 (${(data.results || []).filter((r) => r.status === "uploaded").length}장).`);
      await load(picked);
    });
  }

  async function uploadProductPhoto(file) {
    if (!file) return;
    await run("photo", async () => {
      const draft = state?.[KOREA]?.draft;
      if (!draft) throw new Error("제품 글을 먼저 준비하세요.");
      const form = new FormData();
      form.set("draftId", draft.id);
      form.set("imageId", "img_product_photo");
      form.set("file", file);
      const response = await fetch("/api/atlas/korea-assets", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "제품 사진을 연결하지 못했습니다.");
      await load({ ...picked, [KOREA]: draft.id });
      setMessage("실제 제품 사진을 연결했습니다. 미리보기에서 사진과 수호 장면을 확인하세요.");
    });
  }

  async function prepareSavedProduct(product) {
    await run("prepareProduct", async () => {
      const withProductPhoto = Boolean(product.imageRightsConfirmed && product.localImages?.[0]?.dataUrl);
      const { ok, data } = await postJson("/api/atlas/operate", { action: "prepareProduct", channelId: KOREA,
        productUrl: product.productUrl, withProductPhoto });
      if (!ok) throw new Error(data.error || "판매 정보 확인에 실패했습니다.");
      const photo = withProductPhoto && product.localImages[0];
      let photoNote = "사진 사용 권한이 없어 제품 사진 없이 추천 정보글로 준비했습니다.";
      if (photo?.dataUrl) {
        const blob = await (await fetch(photo.dataUrl)).blob();
        const form = new FormData();
        form.set("draftId", data.id);
        form.set("imageId", "img_product_photo");
        form.set("file", new File([blob], photo.name || "product-photo.png", { type: photo.type || blob.type }));
        const uploaded = await fetch("/api/atlas/korea-assets", { method: "POST", body: form });
        if (uploaded.ok) photoNote = "저장된 사용 승인 제품 사진까지 연결했습니다.";
      }
      setPicked((prev) => ({ ...prev, [KOREA]: data.id }));
      setChoosingTopic(false);
      await load({ ...picked, [KOREA]: data.id });
      setMessage(["확인된 제품 정보와 수호 장면을 준비했습니다.", photoNote, data.generatorError,
        data.missing?.length ? `빠진 수호 장면: ${data.missing.join(", ")}` : ""].filter(Boolean).join(" "));
    });
  }

  if (!state) {
    return (
      <main className="p-8 text-zinc-300">
        {message || "운영 상태를 불러오는 중입니다."}
      </main>
    );
  }

  if (!active) return <main className="mx-auto max-w-3xl space-y-8 px-4 py-16 text-zinc-100">
    <h1 className="text-4xl font-bold">ATLAS BLOG</h1>
    <p className="text-zinc-400">국내 또는 해외를 선택해 블로그를 만드세요.</p>
    <div className="grid gap-4 sm:grid-cols-2">{CHANNELS.map((choice) => <button key={choice.id} type="button" className={`${primary} py-8 text-lg`} onClick={() => setActive(choice.id)}>{choice.label} 블로그 만들기</button>)}</div>
  </main>;
  const channel = state[active];
  const isKorea = active === KOREA;
  const steps = channel.steps;
  const record = isKorea ? channel.draft : channel.article;
  const progress = !record ? 1 : !steps.written || !steps.imagesDone ? 2 : channel.review?.finalReviewReady ? 4 : 3;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-zinc-100">
      <header>
        <div className="text-sm text-amber-300">ATLAS · 단일 운영 화면</div>
        <p className="mt-1 text-xs text-zinc-500">{runtime?.revision ? `실행 기준 코드: ${runtime.revision.slice(0, 12)}${runtime.modified ? " · 로컬 수정 포함" : ""}` : "실행 버전 미확인 · ATLAS.cmd로 실행하면 코드 버전을 확인할 수 있습니다."}</p>
        <h1 className="mt-1 text-3xl font-bold">ATLAS BLOG</h1>
        <p className="mt-2 text-sm text-zinc-400">
          주제 선택 → 글·이미지 준비 → 전체 검수 → 직접 승인 후 게시. 이미지가 부족하면 이유를 보여주고 게시를 막습니다.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={active === c.id}
            onClick={() => { setActive(c.id); setResult(null); setMessage(""); setChoosingTopic(false); }}
            className={`rounded-xl border p-4 text-left ${active === c.id ? "border-emerald-500 bg-zinc-900" : "border-zinc-800 bg-zinc-950"}`}
          >
            <div className="font-bold">{c.label} · {c.character}</div>
            <div className="mt-1 text-xs text-zinc-500">{c.note}</div>
          </button>
        ))}
      </div>

      <StepRail current={steps.published ? 5 : progress} />

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">오늘 작업 시작</h2>
            <p className="mt-1 text-xs text-zinc-400">네이버 공개 글 중복 확인과 국내 공개 상품 후보를 갱신합니다. 해외는 검증된 새 주제를 보여줍니다.</p>
          </div>
          <button type="button" className={primary} disabled={Boolean(busy)} onClick={refreshToday}>
            {busy === "refreshToday" ? "확인 중…" : "최신 이슈·제품·참고 글 업데이트"}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          수익 연결: 쿠팡 파트너스 {approvals?.coupang === "approved" ? "설정상 승인 (실제 계정 재확인 필요)" : "승인 확인 전"} · AdSense 실제 계정 확인 필요
        </p>
      </section>

      <ResearchPanel research={channel.research} topics={channel.topics} busy={Boolean(busy)} onPick={(topicId) => act({ action: "prepare", channelId: active, topicId }, "관련 주제로 글과 장면을 준비했습니다. 최신 이슈의 원문도 함께 검수하세요.")} />

      {generator && !generator.ready ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">
          <span>{connectingEngine ? "이미지 제작 엔진을 자동 연결 중입니다. 처음 시작하면 1분 정도 걸릴 수 있습니다." : generator.message}</span>
          {generator.installed ? <button type="button" className={secondary} disabled={connectingEngine} onClick={connectGenerator}>
            {connectingEngine ? "연결 중…" : "이미지 엔진 다시 연결"}
          </button> : null}
        </div>
      ) : null}

      {message ? <div role={actionFailed ? "alert" : "status"} className="rounded-lg bg-zinc-900 p-3 text-sm text-zinc-200"><p>{actionFailed ? `처리하지 못했습니다. 원인: ${message}` : message}</p>{actionFailed && record ? <a className="mt-2 inline-block text-emerald-300 underline" href="#article-preview">미리보기로 돌아가기</a> : null}</div> : null}

      {!record || choosingTopic ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. 주제 선택</h2>
          {isKorea && channel.today ? (
            <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <h3 className="font-semibold">오늘의 생활 편의 제품 후보</h3>
              <p className="mt-1 text-xs text-zinc-400">{channel.today.source} · {channel.today.checkedAt ? new Date(channel.today.checkedAt).toLocaleString("ko-KR") : "갱신 전"}. 인기 게시판 자료는 판매량 순위가 아닙니다. 가격·판매처·제품 사진 확인 후 글을 만듭니다.</p>
              {channel.today.candidates.length ? <ul className="mt-3 space-y-2 text-sm">
                {channel.today.candidates.map((item) => <li key={item.id} className="rounded-lg border border-zinc-800 p-3">
                  <div className="font-medium">{item.name}</div>
                  <div className="mt-1 text-xs text-zinc-400">게시 가격: {item.priceText}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {item.sellerVerified ? <button type="button" className={secondary} disabled={Boolean(busy)}
                      onClick={() => act({ action: "prepareProduct", channelId: KOREA, productUrl: item.sellerUrl },
                        "판매처 정보를 확인한 추천 글을 준비했습니다. 수호 장면과 전체 글을 검수하세요.")}>
                      판매 정보 확인하고 초안 만들기
                    </button> : <span className="text-xs text-amber-300">판매처 가격·특징 확인 불가 · 자동 제작 후보에서 제외</span>}
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-emerald-300 underline">후보 원문 보기</a>
                  </div>
                </li>)}
              </ul> : <p className="mt-2 text-xs text-amber-300">확인된 상품 후보가 없습니다. 아래 정보글 주제를 선택할 수 있습니다.</p>}
            </section>
          ) : null}
          <TopicPicker
            topics={channel.topics}
            busy={Boolean(busy)}
            onPick={(topicId) => act({ action: "prepare", channelId: active, topicId }, "글과 사용 가능한 장면 이미지를 준비했습니다. 아래에서 빠진 이미지와 전체 내용을 확인하세요.")}
          />
          {isKorea ? (
            <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <h3 className="font-semibold">저장된 제품에서 선택</h3>
              {savedProducts.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {savedProducts.map((product) => (
                  <div key={product.id} className="flex gap-3 rounded-lg border border-zinc-800 p-3">
                    {product.localImages?.[0]?.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.localImages[0].dataUrl} alt="" className="h-20 w-20 rounded object-cover" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{product.name}</div>
                      <div className="mt-1 text-xs text-zinc-400">{product.currentPrice?.toLocaleString("ko-KR") || "가격 재확인"} {product.currency || "KRW"}</div>
                      <button type="button" className={`${secondary} mt-2`} disabled={Boolean(busy)} onClick={() => prepareSavedProduct(product)}>이 제품으로 제작</button>
                    </div>
                  </div>
                ))}
              </div> : <p className="mt-2 text-xs text-zinc-400">저장된 제품이 없으면 아래에 판매 페이지 주소를 넣어 제작할 수 있습니다.</p>}
            </section>
          ) : null}
          {isKorea ? (
            <form className="rounded-xl border border-zinc-800 bg-zinc-950 p-4" onSubmit={(event) => {
              event.preventDefault();
              act({ action: "prepareProduct", channelId: KOREA, productUrl }, "확인된 판매 정보로 추천 글과 수호 장면을 준비했습니다. 전체 글과 이미지를 검수하세요.");
            }}>
              <label className="block text-sm font-semibold" htmlFor="atlas-product-url">제품 추천 글: 판매 페이지 주소</label>
              <p className="mt-1 text-xs text-zinc-400">가격·특징이 확인되는 페이지를 사용합니다. 확인되지 않은 상품은 초안을 만들지 않습니다.</p>
              <div className="mt-3 flex gap-2">
                <input id="atlas-product-url" type="url" required value={productUrl} onChange={(event) => setProductUrl(event.target.value)}
                  placeholder="https://..." className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm" />
                <button type="submit" className={primary} disabled={Boolean(busy)}>제품 글 만들기</button>
              </div>
            </form>
          ) : null}
        </section>
      ) : (
        <>
          {channel.prepared?.length > 1 ? (
            <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <label className="block text-sm">
                <span className="text-zinc-400">준비된 원고 {channel.prepared.length}개</span>
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm"
                  value={record.id}
                  disabled={Boolean(busy)}
                  onChange={(e) => setPicked((prev) => ({ ...prev, [active]: e.target.value }))}
                >
                  {channel.prepared.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </label>
            </section>
          ) : null}

          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-zinc-500">
                  {isKorea ? `${record.blogId} · 수호 · 정보글` : `${record.id} · 미지 · ${record.category}`}
                </div>
                <h2 className="mt-1 text-xl font-bold">{record.title}</h2>
              </div>
              <button
                type="button"
                className={secondary}
                disabled={Boolean(busy)}
                onClick={() => setChoosingTopic(true)}
              >
                다른 주제 선택
              </button>
            </div>
            <details className="mt-3"><summary className="cursor-pointer text-sm">상세 보기</summary><PolicyBadges policy={channel.policy} /></details>
          </section>

          {!steps.published ? <section className="rounded-xl border border-emerald-800 bg-zinc-950 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">글·이미지 제작</h2>
                <p className="mt-1 text-sm text-zinc-400">{steps.written && steps.imagesDone ? "제작 완료. 아래에서 글과 이미지를 확인하세요." : "완료된 글과 이미지는 보존하고, 부족한 부분을 이어서 준비합니다."}</p>
              </div>
              <button type="button" className={primary} disabled={Boolean(busy) || (steps.written && steps.imagesDone)} onClick={prepareContent}>
                {busy === "prepareContent" ? "제작 중…" : steps.written && steps.imagesDone ? "제작 완료" : "글·이미지 준비"}
              </button>
            </div>
          </section> : null}
          <ImagePanel images={steps.images} />
          {isKorea && record.contentType === "info_guide" && steps.images?.ready ? (
            <details className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <summary className="cursor-pointer font-semibold">장면 수정이 필요할 때</summary>
              <p className="mt-1 text-xs text-zinc-400">본문과 맞지 않는 수호 장면만 선택해 다시 만듭니다. 다른 이미지와 글은 보존됩니다.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(record.images || []).filter((img) => ["info_why", "info_how", "info_checklist"].includes(img.role) && img.src).map((img) => (
                  <button key={img.role} type="button" className={secondary} disabled={Boolean(busy)}
                    onClick={() => act({ action: "regenerateKoreaImage", channelId: KOREA, id: record.id, role: img.role }, `${img.placement || img.role} 수호 장면을 다시 만들었습니다. 미리보기에서 확인하세요.`)}>
                    {busy === "regenerateKoreaImage" ? "장면 제작 중…" : `${img.placement || img.role} 장면 다시 만들기`}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
          {isKorea && record.contentType === "new_product_review" ? (
            <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <h2 className="font-semibold">실제 제품 사진</h2>
              <p className="mt-1 text-xs text-zinc-400">직접 촬영했거나 사용 권한이 있는 제품 사진을 연결하세요. 판매 페이지의 사진은 권한 확인 없이 자동 복사하지 않습니다.</p>
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(busy)}
                className="mt-3 block text-sm" onChange={(event) => uploadProductPhoto(event.target.files?.[0])} />
            </section>
          ) : null}

          {!steps.published ? <details className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <summary className="cursor-pointer font-semibold">제목·본문 수정</summary>
            <form key={`${record.id}:${record.updatedAt}`} className="mt-3 space-y-3" onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              act({ action: "saveReview", channelId: active, id: record.id, title: fields.get("title"), text: fields.get("text") }, "수정 내용을 저장했습니다. 최신 글·이미지 묶음으로 다시 검증해주세요.");
            }}>
              <label className="block text-sm">제목<input name="title" required defaultValue={record.title} className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 p-2" /></label>
              <label className="block text-sm">본문<textarea name="text" required rows={16} defaultValue={isKorea ? record.bodyText : record.masterMarkdown || record.bodyMarkdown || ""} className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 p-2" /></label>
              <p className="text-xs text-zinc-400">저장하면 이전 최종 검수와 발행 승인은 해제됩니다.</p>
              <button type="submit" className={secondary} disabled={Boolean(busy)}>수정 저장</button>
            </form>
          </details> : null}

          <section id="article-preview" className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">전체 글·이미지 미리보기</h2>
              <button type="button" className={secondary} disabled={Boolean(busy) || !steps.imagesDone}
                onClick={() => downloadReview(record, channel)}>
                {busy === "downloadReview" ? "검수 파일 준비 중…" : "최종 글·이미지 검수 묶음 저장"}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {isKorea
                ? "본문 사이에 이미지를 배치한 최종 검수 화면입니다."
                : "Blogger에 발행될 글과 이미지의 배치를 확인하세요."}
            </p>
            <div key={record.updatedAt} className="mt-3 rounded-lg bg-white p-4 text-zinc-900">
              <div dangerouslySetInnerHTML={{ __html: channel.preview?.html || "" }} />
            </div>
          </section>

          <ReviewPanel review={channel.review} />
          {isKorea && !steps.published ? <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <h2 className="font-semibold">네이버 편집기 확인</h2>
            <p className="mt-2 text-sm text-zinc-400">글과 이미지를 편집기에 배치하고 순서를 확인합니다. 공개하지 않으며 발행 승인도 남기지 않습니다.</p>
            <button type="button" className={`${secondary} mt-3`} disabled={Boolean(busy) || !steps.imagesDone} onClick={stageKorea}>
              {busy === "stage" ? "편집기 검증 중…" : "네이버 편집기 검증 (발행 안 함)"}
            </button>
            {record.lastError ? <p role="alert" className="mt-3 text-sm text-amber-300">최근 오류: {record.lastError}</p> : null}
            {record.lastAutomation ? <details className="mt-3 text-sm"><summary className="cursor-pointer">최근 편집기 진단 기록</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify(record.lastAutomation, null, 2)}</pre></details> : null}
          </section> : null}
          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <h2 className="font-semibold">최종 검증 결과 반영</h2>
            <p className="mt-2 text-sm text-zinc-400">위 검수 묶음을 이 대화에 보내주세요. 글과 모든 이미지의 검증이 끝나면 받은 검수 완료 코드를 아래에 넣습니다. 이후 사용자 승인으로 발행할 수 있습니다.</p>
            {channel.review?.finalReviewReady ? <p className="mt-2 text-emerald-300">현재 글·이미지 검증 완료</p> : <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); act({ action: "recordFinalReview", channelId: active, id: record.id, reviewCode }, "최종 검수 결과를 반영했습니다. 발행은 직접 승인해야 실행됩니다."); }}>
              <label htmlFor="review-code" className="sr-only">검수 완료 코드</label>
              <input id="review-code" className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 p-2" value={reviewCode} onChange={(event) => setReviewCode(event.target.value)} placeholder="검수 완료 코드" />
              <button className={secondary} disabled={Boolean(busy) || !reviewCode.trim()}>검수 결과 반영</button>
            </form>}
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <h2 className="font-semibold">발행</h2>
            <p className="mt-1 text-xs text-zinc-500">
              자동 발행은 없습니다. 위 최종 검수를 확인한 뒤 &quot;발행&quot;을 눌러야 실제로 공개됩니다.
            </p>
            {!steps.imagesDone ? (
              <p className="mt-1 text-sm text-amber-300">이미지 생성이 끝나야 발행할 수 있습니다.</p>
            ) : null}
            {!isKorea && steps.imagesDone && steps.publicImages < steps.images.total ? (
              <p className="mt-1 text-sm text-amber-300">
                해외 발행에는 공개 이미지 URL이 필요합니다 ({steps.publicImages}/{steps.images.total} 연결됨).
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {!isKorea ? (
                <button type="button" className={secondary} disabled={Boolean(busy) || !steps.imagesDone || !channel.review?.finalReviewReady} onClick={uploadPublicImages}>
                  공개 이미지 연결
                </button>
              ) : null}
              <button
                type="button"
                className={danger}
                disabled={Boolean(busy) || !steps.imagesDone || steps.published || !channel.review || Boolean(channel.review.blocking?.length) || (!isKorea && steps.publicImages < steps.images.total)}
                onClick={isKorea ? publishKorea : publishGlobal}
              >
                {busy === "publish" ? "게시 중…" : "발행"}
              </button>
            </div>
            {isKorea ? (
              <details className="mt-2 text-xs text-zinc-500"><summary>상세 보기</summary><p className="break-all">{channel.editorTarget}</p></details>
            ) : null}
          </section>
        </>
      )}

      {(result?.url || record?.publishedUrl) && (
        <section className="rounded-xl border border-emerald-700 bg-emerald-950/30 p-4">
          <h2 className="font-semibold text-emerald-300">공개 URL</h2>
          <a
            className="mt-1 block break-all text-sm text-emerald-200 underline"
            href={result?.url || record?.publishedUrl}
            target="_blank"
            rel="noreferrer"
          >
            {result?.url || record?.publishedUrl}
          </a>
        </section>
      )}

      <details className="rounded-xl border border-zinc-800 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">이미 공개된 글 {channel.published.length}개</summary>
        <ul className="mt-2 space-y-1 text-xs text-zinc-400">
          {channel.published.slice(0, 12).map((p) => (
            <li key={p.id} className="truncate">
              {p.url ? (
                <a className="text-emerald-300 underline" href={p.url} target="_blank" rel="noreferrer">{p.title || p.id}</a>
              ) : (
                p.title || p.id
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">이 목록과 겹치는 주제는 주제 선택 단계에서 자동으로 막힙니다.</p>
      </details>
    </main>
  );
}

// 최종 검수: 제목 / 요약 / 이미지 전체 / 최근 글 5개와의 중복 비교.
function ReviewPanel({ review }) {
  if (!review) return null;
  return (
    <section className="rounded-xl border border-sky-900 bg-zinc-950 p-4">
      <h2 className="font-semibold">최종 검수</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs text-zinc-500">제목</dt>
          <dd className="font-medium">{review.title}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">요약</dt>
          <dd className="text-zinc-300">{review.summary || "(요약 없음)"}</dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-zinc-300">이미지 {review.images.filter((img) => img.ready).length}/{review.images.length}장 준비 · 배치는 위 전체 미리보기에서 확인</p>

      <h3 className="mt-4 text-sm font-semibold">최근 공개 글 {review.similarity.comparisons.length}개와 비교</h3>
      <table className="mt-2 w-full text-left text-xs">
        <thead className="text-zinc-500">
          <tr>
            <th className="py-1">최근 글</th>
            <th className="py-1">카테고리</th>
            <th className="py-1">겹치는 검색의도</th>
            <th className="py-1">판정</th>
          </tr>
        </thead>
        <tbody>
          {review.similarity.comparisons.map((c) => (
            <tr key={c.id} className="border-t border-zinc-800">
              <td className="py-1 pr-2">{c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="underline">{c.title}</a> : c.title}</td>
              <td className={`py-1 pr-2 ${c.sameCategory ? "text-amber-300" : ""}`}>{c.category || "-"}</td>
              <td className="py-1 pr-2">{c.sharedIntents.join(", ") || "-"}</td>
              <td className={`py-1 ${c.verdict === "similar" ? "text-red-400" : "text-emerald-400"}`}>{c.verdict === "similar" ? "유사 — 교체" : "다름"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {review.warnings.map((w) => (
        <p key={w} className="mt-2 text-sm text-amber-300">경고: {w}</p>
      ))}
      {review.blocking.map((b) => (
        <p key={b} className="mt-2 text-sm text-red-400">발행 불가: {b}</p>
      ))}
    </section>
  );
}

function ResearchPanel({ research, topics, busy, onPick }) {
  if (!research) return null;
  return <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
    <h2 className="font-semibold">최신 이슈와 관련 자료</h2>
    <p className="mt-1 text-xs text-zinc-400">{new Date(research.checkedAt).toLocaleString("ko-KR")} 확인 · {research.stale ? "업데이트가 필요합니다." : "뉴스는 최근 7일 자료만 표시합니다."}</p>
    {!research.issues.length ? <p className="mt-2 text-sm text-amber-300">확인된 최신 이슈가 없습니다. 출처가 연결되면 다시 업데이트하세요.</p> : <ul className="mt-3 space-y-3">{research.issues.map((issue) => <li key={issue.url} className="rounded-lg border border-zinc-800 p-3">
      <a href={issue.url} target="_blank" rel="noreferrer" className="text-emerald-300 underline">{issue.title}</a>
      <p className="text-xs text-zinc-400">{issue.source} · {new Date(issue.publishedAt).toLocaleDateString("ko-KR")}</p>
      {issue.products?.map((product) => <p key={product.id} className="mt-2 text-sm"><a href={product.url} target="_blank" rel="noreferrer">관련 제품: {product.name} · {product.priceText}</a></p>)}
      {issue.relatedTopicIds.map((id) => topics.find((topic) => topic.id === id)).filter(Boolean).map((topic) => <button key={topic.id} className={`${secondary} mt-2`} disabled={busy || Boolean(topic.blockedReason)} onClick={() => onPick(topic.id)}>{topic.title} 제작</button>)}
    </li>)}</ul>}
    <details className="mt-3 text-sm"><summary className="cursor-pointer">관련 참고 블로그·글 보기</summary><p className="mt-2 text-xs text-zinc-500">참고 글은 발행일이 확인되지 않을 수 있습니다. 문장을 복사하지 않고 주제와 독자 질문을 참고합니다.</p><ul>{research.references.map((reference) => <li key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer" className="text-emerald-300 underline">{reference.title}</a></li>)}</ul></details>
    <details className="mt-3 text-xs text-zinc-500"><summary>상세 보기</summary>{research.providers.map((provider) => <p key={provider.source}>{provider.source}: {provider.status === "available" ? "연결됨" : "연결 실패"}</p>)}</details>
  </section>;
}
