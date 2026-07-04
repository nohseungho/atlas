import StaticPageLayout from "@/app/components/StaticPageLayout";

export const metadata = {
  title: "About | ATLAS",
  description: "Learn about ATLAS and how we help readers make informed decisions.",
};

export default function AboutPage() {
  return (
    <StaticPageLayout
      title="About ATLAS"
      description="Who we are and what we're building"
    >
      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          What is ATLAS?
        </h2>
        <p className="mt-2">
          ATLAS is an independent publishing project focused on practical,
          everyday topics like insurance, personal finance, government
          benefits, and money-saving strategies. Our goal is simple: help
          readers find clear answers to questions that usually take hours of
          searching to figure out on their own.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          AI-assisted research and writing
        </h2>
        <p className="mt-2">
          Articles on ATLAS are researched and drafted with the help of AI
          tools, then reviewed before publishing. We use AI to move faster
          and cover more topics, not to replace careful fact-checking. If you
          ever spot something that looks outdated or incorrect, please reach
          out through our{" "}
          <a href="/contact" className="text-emerald-400 hover:underline">
            Contact page
          </a>{" "}
          and we will review it.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Accuracy and transparency
        </h2>
        <p className="mt-2">
          We aim to keep every article accurate and up to date, and we are
          upfront about how the site is run and how it makes money. Where an
          article contains affiliate links or sponsored mentions, we disclose
          it. See our{" "}
          <a
            href="/affiliate-disclosure"
            className="text-emerald-400 hover:underline"
          >
            Affiliate Disclosure
          </a>{" "}
          for details.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Our commitment to readers
        </h2>
        <p className="mt-2">
          ATLAS exists to save readers time and help them make better
          decisions with their money. We don't publish content just to fill
          space, and we don't recommend products or services we wouldn't
          consider ourselves. If ATLAS ever stops being useful to you, we
          want to know why.
        </p>
      </div>
    </StaticPageLayout>
  );
}
