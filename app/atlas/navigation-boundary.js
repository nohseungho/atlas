"use client";

import { usePathname } from "next/navigation";

export default function AtlasNavigation({ children }) {
  const pathname = usePathname();
  if (pathname !== "/atlas/operate") return children;
  return <details className="border-b border-zinc-800 px-6 py-3 text-sm text-zinc-400">
    <summary className="mx-auto max-w-6xl cursor-pointer">상세 보기</summary>
    {children}
  </details>;
}
