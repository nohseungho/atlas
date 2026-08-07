import StaticPageLayout from "@/app/components/StaticPageLayout";

export const metadata = {
  title: "Affiliate Disclosure | ATLAS",
  description: "How ATLAS uses affiliate links, including the Amazon Associates Program.",
};

export default function AffiliateDisclosurePage() {
  return (
    <StaticPageLayout
      title="Affiliate Disclosure"
      description="Last updated: July 2026"
    >
      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Amazon Associates Program
        </h2>
        <p className="mt-2">
          ATLAS is planning to participate in the Amazon Services LLC
          Associates Program, an affiliate advertising program designed to
          provide a means for sites to earn advertising fees by linking to
          Amazon.com and affiliated sites.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Affiliate links
        </h2>
        <p className="mt-2">
          Some links on ATLAS are affiliate links. This means that if you
          click a link and make a purchase, we may earn a small commission
          from the retailer. These links help support the research and
          writing that goes into our articles.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          No extra cost to you
        </h2>
        <p className="mt-2">
          Using an affiliate link never changes the price you pay. The cost
          of the product or service is exactly the same whether you use our
          link or go directly to the retailer.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Independent reviews
        </h2>
        <p className="mt-2">
          Our recommendations are based on our own research and honest
          opinion. Whether or not an article contains affiliate links has no
          bearing on how we evaluate a product or service. If we don't think
          something is worth recommending, we won't recommend it.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Questions
        </h2>
        <p className="mt-2">
          If you have questions about our affiliate relationships, contact
          us at{" "}
          <a
            href="mailto:acadoracool@gmail.com"
            className="text-emerald-400 hover:underline"
          >
            acadoracool@gmail.com
          </a>
          .
        </p>
      </div>
    </StaticPageLayout>
  );
}
