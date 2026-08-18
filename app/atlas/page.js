import Link from "next/link";

const CARDS = [
  {
    href: "/atlas/revenue",
    title: "블로그 글 만들기",
    description:
      "1. 글 주제 선택 → 2. 제작 요청 파일 받기 → 3. 완성 글 파일 등록 → 4. 미리보기·검수 → 5. 블로그 발행 (한 화면 순서 진행)",
  },
  {
    href: "/atlas/blog-studio",
    title: "Blog Studio",
    description: "한국어 MASTER 본문 작성 · Meta/Slug · 제품 연결 관리",
  },
  {
    href: "/atlas/shorts-studio",
    title: "Shorts Studio",
    description:
      "9:16 콘텐츠 제작 · MagicLight 프롬프트 + 상품 사진형 판매카드 6장(1080×1920 PNG·ZIP)",
  },
  {
    href: "/atlas/video-library",
    title: "Video Library",
    description: "수동 제작한 영상의 경로 · 블로그 연결 · 상태 등록",
  },
  {
    href: "/publisher",
    title: "블로그 발행",
    subtitle: "Blogger 실제 발행 · 기존 글 업데이트 · Pinterest 홍보 준비",
    description:
      "Blogger 실제 공개 상태 동기화 → 미리보기 → 승인 → 자동 발행 (postId·URL·발행시각 서버 저장, 중복 발행 차단)",
  },
  {
    href: "/atlas/product-center",
    title: "Product Center",
    description:
      "상품 URL 1개로 가져오기(검수 필요) · 가격/근거/이미지 등록 → 블로그·쇼츠·판매카드에서 같은 ID로 재사용",
  },
  {
    href: "/deal-hunter",
    title: "Deal Hunter",
    subtitle: "반품·개봉·리퍼 특가 검색",
    description:
      "국내외 판매처의 할인 상품을 검수하고 제휴 링크와 쇼핑쇼츠 후보를 관리합니다.",
  },
];

// 실제 운영 순서. 화면을 새로 만들지 않고 대시보드 맨 위에 한 줄로만 둔다.
const FLOW = [
  { label: "상품 찾기", href: "/deal-hunter" },
  { label: "Product Center 검수", href: "/atlas/product-center" },
  { label: "쇼핑쇼츠 제작", href: "/atlas/shorts-studio?mode=photo" },
  { label: "상품 연결 블로그 제작", href: "/atlas/revenue" },
  { label: "발행", href: "/publisher" },
  { label: "Pinterest 배포", href: "/atlas/revenue" },
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

        <section className="rounded-xl border border-sky-900 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-sky-200">운영 순서</h2>
          <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
            {FLOW.map((step, i) => (
              <li key={step.label} className="flex items-center gap-1">
                <Link
                  href={step.href}
                  className="rounded-lg border border-zinc-700 px-2.5 py-1 text-zinc-300 hover:border-emerald-600 hover:text-zinc-100"
                >
                  {i + 1}. {step.label}
                </Link>
                {i < FLOW.length - 1 ? <span className="text-zinc-600">→</span> : null}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-zinc-500">
            반자동입니다. 가격·판매 상태·이미지 사용 권한·제휴 링크·최종 발행은 사용자가 확인해야 하고, 그 밖의
            반복 입력만 자동으로 채워집니다.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-emerald-600"
            >
              <h2 className="text-lg font-semibold">{card.title}</h2>
              {card.subtitle ? (
                <p className="mt-1 text-sm text-zinc-500">{card.subtitle}</p>
              ) : null}
              <p className="mt-2 text-sm text-zinc-400">{card.description}</p>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
