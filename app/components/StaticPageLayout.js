import Link from "next/link";

export default function StaticPageLayout({ title, description, children }) {
  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100 sm:px-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-zinc-400">{description}</p>
          )}
        </header>

        <section className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm leading-relaxed text-zinc-300 sm:p-8">
          {children}
        </section>

        <div>
          <Link
            href="/"
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
