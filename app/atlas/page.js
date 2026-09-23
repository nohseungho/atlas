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

// 현재 운영의 중심은 국내·해외 통합 운영 화면이다. 아래 카드/흐름은 그대로 두고,
// 진입 시 어디로 가야 하는지만 맨 위에서 분명히 한다.
const PRIMARY = {
  href: "/atlas/operate",
  title: "국내·해외 운영 (제작 → 발행)",
  description: "주제 선택 → 자동 작성 → 이미지 생성 → 미리보기 → 발행 → 공개 URL 확인까지 한 화면에서 끝냅니다. 이미지 생성이 끝나야 발행 버튼이 열립니다.",
  lanes: [
    { label: "국내 Naver · 수호", detail: "생활편의·시즌 검색형 정보글 · 제휴 링크 없이 발행 가능", href: "/atlas/operate" },
    { label: "해외 Blogger · 미지", detail: "미지↔수호 문답형 · Quick Answer / TOC / FAQ / Sources · 미지 이미지 5장", href: "/atlas/operate" },
  ],
};

// 레거시 상품 제작 순서. 화면을 새로 만들지 않고 대시보드에 한 줄로만 둔다.
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
            국내 Naver(수호)·해외 Blogger(미지) 운영은 통합 운영 화면에서 시작합니다. 아래 Studio·Product Center
            카드는 원고·상품 자료를 다듬을 때만 사용하고, 실제 발행은 각 채널의 발행 화면에서만 진행합니다.
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            쇼핑쇼츠는 연결자료(상품·이미지·링크·요약) export까지만 담당하며 영상 생성은 하지 않습니다.
          </p>
        </header>

        <section className="rounded-xl border border-emerald-700 bg-zinc-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">지금 운영 중심</p>
          <Link href={PRIMARY.href} className="mt-1 block text-xl font-bold hover:text-emerald-300">
            {PRIMARY.title} →
          </Link>
          <p className="mt-1 text-sm text-zinc-400">{PRIMARY.description}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {PRIMARY.lanes.map((lane) => (
              <Link
                key={lane.href}
                href={lane.href}
                className="rounded-lg border border-zinc-700 p-3 text-sm hover:border-emerald-600"
              >
                <span className="font-semibold text-zinc-100">{lane.label}</span>
                <span className="mt-1 block text-xs text-zinc-400">{lane.detail}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-sky-900 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-sky-200">상품 제작 순서 (레거시 · 필요할 때만)</h2>
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
