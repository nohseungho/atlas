import Link from "next/link";

const CARDS = [
  {
    href: "/atlas/revenue",
    title: "수익 자동화 R2",
    description:
      "이번 주 자동추천 → 원고·QA → 승인·발행 → 쇼핑 쇼츠 → 캠페인 → 실제 성과 (한 화면 흐름)",
  },
  {
    href: "/atlas/blog-studio",
    title: "Blog Studio",
    description: "한국어 MASTER 본문 작성 · Meta/Slug · 제품 연결 관리",
  },
  {
    href: "/atlas/shorts-studio",
    title: "Shorts Studio",
    description: "카테고리 · AI 엔진 · 길이 기준 MagicLight 프롬프트 생성",
  },
  {
    href: "/atlas/video-library",
    title: "Video Library",
    description: "수동 제작한 영상의 경로 · 블로그 연결 · 상태 등록",
  },
  {
    href: "/atlas/publishing",
    title: "Publishing Center",
    description: "승인된 블로그·영상 패키지 확인 및 발행 준비",
  },
  {
    href: "/atlas/product-center",
    title: "Product Center",
    description: "Affiliate 상품 마스터 DB · 블로그/쇼츠에서 재사용",
  },
];

export default function AtlasPage() {
  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold">ATLAS Platform</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            Topic → Blog Studio → SEO Blog → Affiliate Product Placement
            (Product Center) → Shorts Studio → MagicLight Prompt → (사용자가
            영상 수동 제작) → Video Library → Approval → Publishing Center
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            이 화면은 UI/데이터 흐름 뼈대이며, 실제 자동 발행·업로드·외부 API
            연동은 포함하지 않습니다. 데이터는 브라우저 localStorage에만
            저장됩니다.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-emerald-600"
            >
              <h2 className="text-lg font-semibold">{card.title}</h2>
              <p className="mt-2 text-sm text-zinc-400">{card.description}</p>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
