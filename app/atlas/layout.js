import Link from "next/link";

export const metadata = {
  title: "ATLAS Platform",
  description: "ATLAS 블로그·쇼츠·제휴상품 콘텐츠 파이프라인 스켈레톤",
};

const NAV_ITEMS = [
  { href: "/atlas", label: "Dashboard" },
  { href: "/atlas/revenue", label: "블로그 글 만들기" },
  { href: "/atlas/blog-studio", label: "Blog Studio" },
  { href: "/atlas/shorts-studio", label: "Shorts Studio" },
  { href: "/atlas/video-library", label: "Video Library" },
  // 반자동 제작의 실제 발행 화면은 /publisher다. /atlas/publishing은 Blog Studio
  // 수동 MASTER 전용 레거시 화면이라 일반 메뉴에서는 노출하지 않고,
  // "블로그 글 만들기 → 고급 설정"에만 남긴다.
  { href: "/publisher", label: "블로그 발행" },
  { href: "/atlas/product-center", label: "Product Center" },
];

export default function AtlasLayout({ children }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="border-b border-zinc-800 px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
          <span className="text-sm font-semibold text-emerald-400">
            ATLAS Platform
          </span>
          <div className="flex flex-wrap gap-3 text-sm text-zinc-400">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:text-zinc-100"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <Link
            href="/"
            className="ml-auto text-sm text-zinc-500 hover:text-zinc-100"
          >
            ← Ops Dashboard
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
