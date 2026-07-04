import Link from "next/link";
import { readJson } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const { keywords } = readJson("keywords.json");
  const { articles } = readJson("articles.json");

  const totalKeywords = keywords.length;
  const selectedKeywords = keywords.filter((k) => k.status === "selected").length;
  const ideaKeywords = keywords.filter((k) => k.status === "idea").length;

  const writtenArticles = articles.filter(
    (a) => a.status === "written" || a.status === "published"
  ).length;
  const publishedArticles = articles.filter((a) => a.status === "published").length;
  const pendingPublishing = articles.filter((a) => a.status === "written").length;

  const averageMoneyScore = totalKeywords
    ? Math.round(keywords.reduce((sum, k) => sum + k.moneyScore, 0) / totalKeywords)
    : 0;

  const topKeywords = [...keywords]
    .sort((a, b) => b.moneyScore - a.moneyScore)
    .slice(0, 5);

  const todoItems = [];
  if (selectedKeywords > 0) {
    todoItems.push(`Writer에서 selected 키워드 ${selectedKeywords}개 글 작성하기`);
  }
  if (pendingPublishing > 0) {
    todoItems.push(`Publisher에서 작성 완료 글 ${pendingPublishing}개 발행하기`);
  }
  if (ideaKeywords < 5) {
    todoItems.push("Money Hunter에 새 키워드 등록하기 (idea 재고 부족)");
  }
  if (todoItems.length === 0) {
    todoItems.push("오늘 처리할 작업이 없습니다.");
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold">ATLAS Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">블로그 수익화 운영 현황</p>
        </header>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="총 키워드" value={totalKeywords} />
          <StatCard label="Selected 키워드" value={selectedKeywords} />
          <StatCard label="작성 완료 글" value={writtenArticles} />
          <StatCard label="발행 완료 글" value={publishedArticles} />
          <StatCard label="평균 Money Score" value={averageMoneyScore} />
          <StatCard label="발행 대기" value={pendingPublishing} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">오늘 할 일</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-300">
              {todoItems.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-emerald-400">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">상위 Money Score 키워드</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {topKeywords.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center justify-between border-b border-zinc-800 pb-2 last:border-0"
                >
                  <div>
                    <p className="font-medium text-zinc-100">{k.keyword}</p>
                    <p className="text-xs text-zinc-500">
                      {k.category} · {k.status}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-400">
                    {k.moneyScore}
                  </span>
                </li>
              ))}
              {topKeywords.length === 0 && (
                <li className="text-zinc-500">등록된 키워드가 없습니다.</li>
              )}
            </ul>
          </div>
        </section>

        <section className="flex flex-wrap gap-3">
          <Link
            href="/money-hunter"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Money Hunter
          </Link>
          <Link
            href="/writer"
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            Writer
          </Link>
          <Link
            href="/publisher"
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            Publisher
          </Link>
          <Link
            href="/atlas"
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            ATLAS Platform (Beta)
          </Link>
        </section>

        <section className="flex flex-wrap gap-3 border-t border-zinc-800 pt-6 text-sm">
          <Link href="/about" className="text-zinc-400 hover:text-zinc-100">
            About
          </Link>
          <Link href="/privacy" className="text-zinc-400 hover:text-zinc-100">
            Privacy Policy
          </Link>
          <Link href="/contact" className="text-zinc-400 hover:text-zinc-100">
            Contact
          </Link>
          <Link
            href="/affiliate-disclosure"
            className="text-zinc-400 hover:text-zinc-100"
          >
            Affiliate Disclosure
          </Link>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-50">{value}</p>
    </div>
  );
}
