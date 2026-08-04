/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

const CONDITION_LABELS = {
  SEALED_RETURN: "미개봉 반품",
  OPEN_BOX_EXCELLENT: "개봉·최상 (Open Box)",
  OPEN_BOX_GOOD: "개봉·상",
  REFURB_CERTIFIED: "공식 인증 리퍼",
  REFURB_SELLER: "판매자 리퍼",
  DISPLAY_ITEM: "전시상품",
  USED: "일반 중고",
  UNKNOWN: "상태 확인 불가",
};

const CONDITION_COLORS = {
  SEALED_RETURN: "bg-emerald-500/20 text-emerald-300",
  OPEN_BOX_EXCELLENT: "bg-teal-500/20 text-teal-300",
  OPEN_BOX_GOOD: "bg-sky-500/20 text-sky-300",
  REFURB_CERTIFIED: "bg-indigo-500/20 text-indigo-300",
  REFURB_SELLER: "bg-violet-500/20 text-violet-300",
  DISPLAY_ITEM: "bg-amber-500/20 text-amber-300",
  USED: "bg-zinc-700 text-zinc-200",
  UNKNOWN: "bg-red-500/20 text-red-300",
};

const VERIFICATION_LABELS = {
  PENDING: "검수 대기",
  VERIFIED: "검수 완료",
  EXCLUDED: "제외됨",
};

const VERIFICATION_COLORS = {
  PENDING: "bg-amber-500/20 text-amber-300",
  VERIFIED: "bg-emerald-500/20 text-emerald-300",
  EXCLUDED: "bg-zinc-700 text-zinc-400",
};

const SORT_OPTIONS = [
  { value: "createdAtDesc", label: "최근 등록 순" },
  { value: "checkedAtDesc", label: "최근 확인 순" },
  { value: "priceAsc", label: "가격 낮은 순" },
  { value: "discountDesc", label: "할인율 높은 순" },
];

const SOURCE_OPTIONS = [
  { value: "coupang", label: "쿠팡" },
  { value: "other", label: "기타 쇼핑몰" },
];

const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500";
const labelClass = "text-xs font-medium text-zinc-400";
const btnClass =
  "rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-emerald-600 hover:text-emerald-300 disabled:opacity-40";

function localNowValue() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyManualForm = {
  source: "coupang",
  sourceUrl: "",
  affiliateUrl: "",
  title: "",
  manufacturer: "",
  modelNumber: "",
  sourceItemId: "",
  imageUrl: "",
  conditionOriginal: "",
  conditionEvidence: "",
  price: "",
  currency: "KRW",
  shippingCost: "",
  importCost: "",
  referenceNewPrice: "",
  packageContents: "",
  warranty: "",
  returnPolicy: "",
  availability: "",
  seller: "",
  checkedAt: "",
};

function money(value, currency) {
  if (value === null || value === undefined) return "미확인";
  return `${Number(value).toLocaleString()} ${currency || ""}`.trim();
}

function dateText(value) {
  if (!value) return "미확인";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "미확인" : d.toLocaleString("ko-KR");
}

function Badge({ className, children }) {
  return <span className={`rounded px-2 py-0.5 text-xs ${className}`}>{children}</span>;
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-200 break-words">{children ?? "미확인"}</div>
    </div>
  );
}

function ProductImage({ urls, alt }) {
  const [failed, setFailed] = useState(false);
  const url = Array.isArray(urls) ? urls[0] : "";
  if (!url || failed) {
    return (
      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-[11px] text-zinc-600">
        이미지 없음
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt || "상품 이미지"}
      className="h-24 w-24 shrink-0 rounded-md border border-zinc-800 object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export default function DealHunterPage() {
  const [providers, setProviders] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [providerId, setProviderId] = useState("ebay");
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);

  const [form, setForm] = useState(emptyManualForm);
  const [formErrors, setFormErrors] = useState([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  const [filters, setFilters] = useState({
    source: "",
    conditionNormalized: "",
    verificationStatus: "",
    monetizationStatus: "",
    shortsCandidate: "",
  });
  const [sort, setSort] = useState("createdAtDesc");

  // 등록·수정 후 목록을 다시 읽기 위한 토큰. 상태 반영은 effect의 콜백에서만 한다.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // 서버 조회만 담당한다(상태 변경 없음).
  const fetchDeals = useCallback(async () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    params.set("sort", sort);
    const res = await fetch(`/api/deal-hunter/deals?${params.toString()}`, { cache: "no-store" });
    return res.json();
  }, [filters, sort]);

  useEffect(() => {
    let cancelled = false;
    fetchDeals().then(
      (data) => {
        if (cancelled) return;
        setDeals(data.deals || []);
        setProviders(data.providers || []);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setMessage("저장된 상품 목록을 불러오지 못했습니다.");
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetchDeals, reloadToken]);

  const ebayReadiness = useMemo(
    () => providers.find((p) => p.id === "ebay")?.readiness || null,
    [providers],
  );

  async function handleSearch(e) {
    e.preventDefault();
    setSearching(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ q: query.trim(), provider: providerId });
      const res = await fetch(`/api/deal-hunter/search?${params.toString()}`, { cache: "no-store" });
      setSearchResult(await res.json());
    } catch {
      setSearchResult({ status: "error", message: "검색 요청에 실패했습니다.", items: [] });
    }
    setSearching(false);
  }

  async function saveApiItem(item) {
    setBusyId(item.sourceUrl);
    setMessage("");
    try {
      const res = await fetch("/api/deal-hunter/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "api", item, query: searchResult?.query || "" }),
      });
      const data = await res.json();
      if (!res.ok) setMessage(data.message || (data.errors || []).join(" / ") || "저장에 실패했습니다.");
      else {
        setMessage(`저장 완료: ${data.deal.id}`);
        reload();
      }
    } catch {
      setMessage("저장 요청에 실패했습니다.");
    }
    setBusyId("");
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    setFormErrors([]);
    setMessage("");
    setBusyId("manual");
    try {
      const payload = { ...form };
      payload.checkedAt = form.checkedAt
        ? new Date(form.checkedAt).toISOString()
        : new Date().toISOString();
      payload.imageUrls = form.imageUrl ? [form.imageUrl] : [];
      const res = await fetch("/api/deal-hunter/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "manual", deal: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormErrors(data.errors || [data.message || "등록에 실패했습니다."]);
      } else {
        setMessage(`수동 등록 완료: ${data.deal.id}`);
        setForm({ ...emptyManualForm, source: form.source, currency: form.currency });
        reload();
      }
    } catch {
      setFormErrors(["등록 요청에 실패했습니다."]);
    }
    setBusyId("");
  }

  async function patchDeal(id, patch) {
    setBusyId(id);
    setMessage("");
    try {
      const res = await fetch(`/api/deal-hunter/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) setMessage(`${id}: ${(data.errors || [data.message]).filter(Boolean).join(" / ")}`);
      else reload();
    } catch {
      setMessage("수정 요청에 실패했습니다.");
    }
    setBusyId("");
  }

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="border-b border-zinc-800 px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
          <span className="text-sm font-semibold text-emerald-400">Deal Hunter</span>
          <span className="text-sm text-zinc-500">반품·개봉·리퍼 특가 검색</span>
          <Link href="/atlas" className="ml-auto text-sm text-zinc-500 hover:text-zinc-100">
            ← ATLAS Platform
          </Link>
        </div>
      </nav>

      <div className="px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <header>
            <h1 className="text-2xl font-bold">Deal Hunter</h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-400">
              국내외 판매처의 반품·개봉·리퍼 상품을 검수하고 제휴 링크와 쇼핑쇼츠 후보를 관리합니다.
              ATLAS는 상품을 직접 판매하지 않으며, 구매는 판매처에서 이루어집니다.
            </p>
          </header>

          {message ? (
            <div className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200">{message}</div>
          ) : null}

          {/* ── 검색 ───────────────────────────────────────────────── */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">상품 검색</h2>
            <form onSubmit={handleSearch} className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[260px] flex-1">
                <label className={labelClass} htmlFor="dh-q">
                  제품명 또는 정확한 모델번호
                </label>
                <input
                  id="dh-q"
                  className={inputClass}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="예: Sony WH-1000XM5"
                />
              </div>
              <div className="w-56">
                <label className={labelClass} htmlFor="dh-provider">
                  Provider
                </label>
                <select
                  id="dh-provider"
                  className={inputClass}
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                >
                  {(providers.length ? providers : [{ id: "ebay", label: "eBay 자동검색" }]).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={btnClass} disabled={searching}>
                {searching ? "검색 중…" : "검색"}
              </button>
            </form>

            {ebayReadiness && !ebayReadiness.ready ? (
              <p className="mt-3 rounded-md border border-amber-700/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                eBay API 연결 필요 · 자동검색이 비활성 상태입니다. 필요한 환경변수:{" "}
                {(ebayReadiness.envNeeded || []).join(", ")} · 수동 등록은 정상 동작합니다.
              </p>
            ) : null}

            {searchResult ? <SearchResultBlock result={searchResult} busyId={busyId} onSave={saveApiItem} /> : null}
          </section>

          {/* ── 수동 등록 ──────────────────────────────────────────── */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">쿠팡 · 기타 쇼핑몰 수동 등록</h2>
            <p className="mt-1 text-xs text-zinc-500">
              쿠팡은 공식 반품마켓 검색 API가 확인되지 않아 자동검색을 제공하지 않습니다. 상품 URL과 검수 결과를 직접 입력합니다.
            </p>

            <form onSubmit={handleManualSubmit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={labelClass}>판매처 *</label>
                <select className={inputClass} value={form.source} onChange={(e) => updateForm("source", e.target.value)}>
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>원본 상품 URL *</label>
                <input className={inputClass} value={form.sourceUrl} onChange={(e) => updateForm("sourceUrl", e.target.value)} placeholder="https://…" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>상품명 *</label>
                <input className={inputClass} value={form.title} onChange={(e) => updateForm("title", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>원본 상품 상태 *</label>
                <input className={inputClass} value={form.conditionOriginal} onChange={(e) => updateForm("conditionOriginal", e.target.value)} placeholder="예: 미개봉 / 최상 / 상" />
              </div>
              <div>
                <label className={labelClass}>판매 가격 *</label>
                <input className={inputClass} value={form.price} onChange={(e) => updateForm("price", e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <label className={labelClass}>통화 *</label>
                <input className={inputClass} value={form.currency} onChange={(e) => updateForm("currency", e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className={labelClass}>마지막 확인 시각 * (비우면 등록 시각)</label>
                <div className="flex gap-2">
                  <input type="datetime-local" className={inputClass} value={form.checkedAt} onChange={(e) => updateForm("checkedAt", e.target.value)} />
                  <button type="button" className={btnClass} onClick={() => updateForm("checkedAt", localNowValue())}>
                    지금
                  </button>
                </div>
              </div>
              <div>
                <label className={labelClass}>제조사</label>
                <input className={inputClass} value={form.manufacturer} onChange={(e) => updateForm("manufacturer", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>모델번호</label>
                <input className={inputClass} value={form.modelNumber} onChange={(e) => updateForm("modelNumber", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>판매처 상품 ID</label>
                <input className={inputClass} value={form.sourceItemId} onChange={(e) => updateForm("sourceItemId", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>이미지 URL</label>
                <input className={inputClass} value={form.imageUrl} onChange={(e) => updateForm("imageUrl", e.target.value)} placeholder="https://…" />
              </div>
              <div>
                <label className={labelClass}>배송비</label>
                <input className={inputClass} value={form.shippingCost} onChange={(e) => updateForm("shippingCost", e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <label className={labelClass}>수입 비용</label>
                <input className={inputClass} value={form.importCost} onChange={(e) => updateForm("importCost", e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <label className={labelClass}>비교 기준 새상품 가격</label>
                <input className={inputClass} value={form.referenceNewPrice} onChange={(e) => updateForm("referenceNewPrice", e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <label className={labelClass}>판매자</label>
                <input className={inputClass} value={form.seller} onChange={(e) => updateForm("seller", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>구성품</label>
                <input className={inputClass} value={form.packageContents} onChange={(e) => updateForm("packageContents", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>보증 / A/S</label>
                <input className={inputClass} value={form.warranty} onChange={(e) => updateForm("warranty", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>반품 조건</label>
                <input className={inputClass} value={form.returnPolicy} onChange={(e) => updateForm("returnPolicy", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>재고 상태 / 메모</label>
                <input className={inputClass} value={form.availability} onChange={(e) => updateForm("availability", e.target.value)} placeholder="예: 재고 3개 / 품절" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>제휴 URL (없으면 비워둠)</label>
                <input className={inputClass} value={form.affiliateUrl} onChange={(e) => updateForm("affiliateUrl", e.target.value)} placeholder="https://… (쿠팡파트너스 등)" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={labelClass}>상태 판정 근거</label>
                <input className={inputClass} value={form.conditionEvidence} onChange={(e) => updateForm("conditionEvidence", e.target.value)} placeholder="판매처 표기·상세페이지에서 확인한 내용" />
              </div>

              {formErrors.length ? (
                <ul className="sm:col-span-2 lg:col-span-3 list-disc space-y-1 rounded-md border border-red-800/60 bg-red-500/10 px-5 py-3 text-xs text-red-300">
                  {formErrors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              ) : null}

              <div className="sm:col-span-2 lg:col-span-3">
                <button type="submit" className={btnClass} disabled={busyId === "manual"}>
                  {busyId === "manual" ? "등록 중…" : "상품 등록"}
                </button>
              </div>
            </form>
          </section>

          {/* ── 저장 목록 ──────────────────────────────────────────── */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <h2 className="text-lg font-semibold">저장된 상품 ({deals.length})</h2>
              <div className="ml-auto flex flex-wrap gap-2">
                <select className={`${inputClass} w-auto`} value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
                  <option value="">판매처 전체</option>
                  <option value="ebay">eBay</option>
                  <option value="coupang">쿠팡</option>
                  <option value="other">기타 쇼핑몰</option>
                </select>
                <select className={`${inputClass} w-auto`} value={filters.conditionNormalized} onChange={(e) => setFilters({ ...filters, conditionNormalized: e.target.value })}>
                  <option value="">표준 상태 전체</option>
                  {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <select className={`${inputClass} w-auto`} value={filters.verificationStatus} onChange={(e) => setFilters({ ...filters, verificationStatus: e.target.value })}>
                  <option value="">검수 상태 전체</option>
                  {Object.entries(VERIFICATION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <select className={`${inputClass} w-auto`} value={filters.monetizationStatus} onChange={(e) => setFilters({ ...filters, monetizationStatus: e.target.value })}>
                  <option value="">제휴 연결 전체</option>
                  <option value="CONNECTED">제휴 연결됨</option>
                  <option value="UNCONNECTED">제휴 미연결</option>
                </select>
                <select className={`${inputClass} w-auto`} value={filters.shortsCandidate} onChange={(e) => setFilters({ ...filters, shortsCandidate: e.target.value })}>
                  <option value="">쇼츠 후보 전체</option>
                  <option value="true">쇼츠 후보만</option>
                  <option value="false">후보 아님만</option>
                </select>
                <select className={`${inputClass} w-auto`} value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-zinc-500">불러오는 중…</p>
            ) : deals.length === 0 ? (
              <p className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-500">
                저장된 상품이 없습니다. eBay 검색 결과를 저장하거나 수동 등록을 사용하세요.
              </p>
            ) : (
              deals.map((deal) => (
                <DealCard key={deal.id} deal={deal} busy={busyId === deal.id} onPatch={patchDeal} />
              ))
            )}
          </section>

          <footer className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-xs leading-relaxed text-zinc-400">
            <p className="font-semibold text-zinc-300">필수 안내</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>ATLAS는 상품 판매자가 아닙니다. 결제·배송·교환·환불은 각 판매처가 담당합니다.</li>
              <li>가격과 재고는 마지막 확인 시점 기준이며 현재 값과 다를 수 있습니다.</li>
              <li>구매 전 판매처에서 상품 상태·구성품·보증·반품 조건을 반드시 다시 확인하세요.</li>
              <li>일부 링크를 통해 구매하면 ATLAS가 수수료를 받을 수 있습니다.</li>
              <li>제휴 미연결 상품은 수익 추적이 되지 않습니다.</li>
            </ul>
          </footer>
        </div>
      </div>
    </div>
  );
}

function SearchResultBlock({ result, busyId, onSave }) {
  if (result.status === "provider_not_configured") {
    return (
      <div className="mt-4 rounded-md border border-amber-700/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
        eBay API 연결 필요 — 실제 검색을 실행할 수 없습니다. (mock 결과를 만들지 않습니다)
        <div className="mt-1 text-xs text-amber-200/80">필요한 환경변수: {(result.envNeeded || []).join(", ")}</div>
      </div>
    );
  }
  if (result.status === "manual_only") {
    return (
      <div className="mt-4 rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
        {result.message}
        <div className="mt-1 text-xs text-zinc-500">{result.note}</div>
      </div>
    );
  }
  if (result.status === "error") {
    return (
      <div className="mt-4 rounded-md border border-red-800/60 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {result.message || "검색에 실패했습니다."}
      </div>
    );
  }

  const items = result.items || [];
  if (items.length === 0) {
    return (
      <p className="mt-4 rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
        조건에 맞는 반품·개봉·리퍼 상품이 없습니다. (결과 0건 — 대체 상품을 만들지 않습니다)
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-zinc-500">
        {result.marketplaceId} · 검색 결과 {items.length}건
        {result.affiliateReady ? "" : " · 제휴 캠페인 ID 미설정 (제휴 URL 생성 불가)"}
      </p>
      {items.map((item) => (
        <div key={item.sourceUrl || item.sourceItemId} className="flex gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <ProductImage urls={item.imageUrls} alt={item.title} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={CONDITION_COLORS[item.conditionNormalized]}>
                {CONDITION_LABELS[item.conditionNormalized]}
              </Badge>
              <span className="text-xs text-zinc-500">원본: {item.conditionOriginal || "미확인"}</span>
              <Badge className={item.affiliateUrl ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-400"}>
                {item.affiliateUrl ? "제휴 연결됨" : "제휴 미연결"}
              </Badge>
            </div>
            <p className="text-sm font-medium text-zinc-100">{item.title}</p>
            <p className="text-xs text-zinc-500">{item.conditionEvidence}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400">
              <span>가격 {money(item.price, item.currency)}</span>
              <span>배송비 {item.shippingCost === null ? "미확인" : money(item.shippingCost, item.currency)}</span>
              <span>판매자 {item.seller || "미확인"}</span>
              <span>한국 배송 {item.shipToKorea}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline">
                원본 상품 보기
              </a>
              <button type="button" className={btnClass} disabled={busyId === item.sourceUrl} onClick={() => onSave(item)}>
                {busyId === item.sourceUrl ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DealCard({ deal, busy, onPatch }) {
  const [affiliateInput, setAffiliateInput] = useState(deal.affiliateUrl || "");

  const shortsBlocked =
    deal.verificationStatus !== "VERIFIED" ||
    deal.conditionNormalized === "UNKNOWN" ||
    !deal.sourceUrl ||
    deal.price === null ||
    !deal.currency;

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-wrap gap-4">
        <ProductImage urls={deal.imageUrls} alt={deal.title} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-600">{deal.id}</span>
            <Badge className={CONDITION_COLORS[deal.conditionNormalized]}>{CONDITION_LABELS[deal.conditionNormalized]}</Badge>
            <Badge className={VERIFICATION_COLORS[deal.verificationStatus]}>{VERIFICATION_LABELS[deal.verificationStatus]}</Badge>
            <Badge className={deal.monetizationStatus === "CONNECTED" ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-400"}>
              {deal.monetizationStatus === "CONNECTED" ? "제휴 연결됨" : "제휴 미연결 · 현재 수익 추적 불가"}
            </Badge>
            {deal.shortsCandidate ? <Badge className="bg-fuchsia-500/20 text-fuchsia-300">쇼핑쇼츠 후보</Badge> : null}
            <span className="ml-auto text-xs text-zinc-500">{deal.sourceMode === "API" ? "API 수집" : "수동 검수 등록"}</span>
          </div>

          <h3 className="text-base font-semibold text-zinc-100">{deal.title}</h3>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="판매처">{deal.source}</Field>
            <Field label="제조사">{deal.manufacturer || null}</Field>
            <Field label="모델번호">{deal.modelNumber || null}</Field>
            <Field label="판매자">{deal.seller || null}</Field>
            <Field label="원본 상품 상태">{deal.conditionOriginal || null}</Field>
            <Field label="상품 가격">{money(deal.price, deal.currency)}</Field>
            <Field label="배송비">{deal.shippingCost === null ? "미확인" : money(deal.shippingCost, deal.currency)}</Field>
            <Field label="수입 비용">{deal.importCost === null ? "미확인" : money(deal.importCost, deal.currency)}</Field>
            <Field label="확인된 총비용">
              {money(deal.totalCost, deal.currency)}
              {deal.totalCostConfirmed ? "" : " (미확인 비용 포함)"}
            </Field>
            <Field label="비교 기준 새상품 가격">
              {deal.referenceNewPrice === null ? "미확인" : money(deal.referenceNewPrice, deal.referenceCurrency)}
            </Field>
            <Field label="할인액">{deal.discountAmount === null ? "계산 불가" : money(deal.discountAmount, deal.currency)}</Field>
            <Field label="할인율">{deal.discountPercent === null ? "계산 불가" : `${deal.discountPercent}%`}</Field>
            <Field label="구성품">{deal.packageContents || null}</Field>
            <Field label="보증 / A/S">{deal.warranty || null}</Field>
            <Field label="반품 조건">{deal.returnPolicy || null}</Field>
            <Field label="재고 상태">{deal.availability}</Field>
            <Field label="한국 배송">{deal.shipToKorea}</Field>
            <Field label="마지막 확인 시각">{dateText(deal.checkedAt)}</Field>
            <Field label="등록 시각">{dateText(deal.createdAt)}</Field>
          </div>

          <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
            <span className="text-zinc-500">상태 판정 근거: </span>
            {deal.conditionEvidence || "기록 없음"}
            <div className="mt-1">
              <span className="text-zinc-500">할인 계산 근거: </span>
              {deal.discountBasis}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <a href={deal.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
              원본 구매 URL
            </a>
            {deal.affiliateUrl ? (
              <a href={deal.affiliateUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">
                제휴 URL
              </a>
            ) : (
              <span className="text-zinc-500">제휴 URL 없음</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
            <button type="button" className={btnClass} disabled={busy} onClick={() => onPatch(deal.id, { verificationStatus: "VERIFIED" })}>
              검수 완료
            </button>
            <button type="button" className={btnClass} disabled={busy} onClick={() => onPatch(deal.id, { verificationStatus: "PENDING" })}>
              검수 대기
            </button>
            <button type="button" className={btnClass} disabled={busy} onClick={() => onPatch(deal.id, { verificationStatus: "EXCLUDED" })}>
              제외
            </button>
            <button
              type="button"
              className={btnClass}
              disabled={busy || (!deal.shortsCandidate && shortsBlocked)}
              title={!deal.shortsCandidate && shortsBlocked ? "검수 완료 · 표준 상태 확인 · 가격/통화/URL이 모두 필요합니다." : ""}
              onClick={() => onPatch(deal.id, { shortsCandidate: !deal.shortsCandidate })}
            >
              {deal.shortsCandidate ? "쇼츠 후보 해제" : "쇼핑쇼츠 후보로 저장"}
            </button>
            <button type="button" className={btnClass} disabled={busy} onClick={() => onPatch(deal.id, { checkedAt: new Date().toISOString() })}>
              지금 확인함으로 갱신
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1">
              <label className={labelClass}>제휴 URL 등록 / 수정</label>
              <input className={inputClass} value={affiliateInput} onChange={(e) => setAffiliateInput(e.target.value)} placeholder="https://…" />
            </div>
            <button
              type="button"
              className={btnClass}
              disabled={busy}
              onClick={() =>
                onPatch(deal.id, {
                  affiliateUrl: affiliateInput.trim(),
                  monetizationStatus: affiliateInput.trim() ? "CONNECTED" : "UNCONNECTED",
                })
              }
            >
              제휴 URL 저장
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
