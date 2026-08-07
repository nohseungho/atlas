import StaticPageLayout from "@/app/components/StaticPageLayout";

export const metadata = {
  title: "Contact | ATLAS",
  description: "Get in touch with the ATLAS team.",
};

export default function ContactPage() {
  return (
    <StaticPageLayout
      title="Contact"
      description="We'd like to hear from you"
    >
      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Email us
        </h2>
        <p className="mt-2">
          For general questions, corrections, or feedback about any article
          on ATLAS, reach out at{" "}
          <a
            href="mailto:acadoracool@gmail.com"
            className="text-emerald-400 hover:underline"
          >
            acadoracool@gmail.com
          </a>
          .
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Response time
        </h2>
        <p className="mt-2">
          We typically reply within 2–3 business days. If your message is
          time-sensitive, please mention that in your email and we'll do our
          best to get back to you sooner.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Partnerships and collaboration
        </h2>
        <p className="mt-2">
          Interested in a partnership, sponsorship, or collaboration with
          ATLAS? Send a short summary of your idea, along with any relevant
          links, to the email above and we'll follow up if it's a good fit.
        </p>
      </div>
    </StaticPageLayout>
  );
}
