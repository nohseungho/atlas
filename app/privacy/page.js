import StaticPageLayout from "@/app/components/StaticPageLayout";

export const metadata = {
  title: "Privacy Policy | ATLAS",
  description: "How ATLAS collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <StaticPageLayout
      title="Privacy Policy"
      description="Last updated: July 2026"
    >
      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Overview
        </h2>
        <p className="mt-2">
          This Privacy Policy explains what information ATLAS collects when
          you visit our site, how it is used, and the choices available to
          you. By using this site, you agree to the practices described
          below.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Cookies
        </h2>
        <p className="mt-2">
          ATLAS uses cookies and similar technologies to keep the site
          working properly, remember basic preferences, and understand how
          the site is used. You can disable cookies in your browser
          settings, though some parts of the site may not work as intended
          without them.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Google AdSense
        </h2>
        <p className="mt-2">
          ATLAS uses Google AdSense to display advertising. Google and its
          partners may use cookies to serve ads based on your prior visits
          to this site or other sites on the internet. You can opt out of
          personalized advertising by visiting{" "}
          <a
            href="https://adssettings.google.com"
            className="text-emerald-400 hover:underline"
          >
            Google Ads Settings
          </a>
          .
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Google Analytics
        </h2>
        <p className="mt-2">
          We use Google Analytics to understand how visitors use ATLAS, such
          as which pages are viewed and how long visitors stay. This data is
          aggregated and does not identify you personally. You can learn
          more about how Google handles this data at{" "}
          <a
            href="https://policies.google.com/privacy"
            className="text-emerald-400 hover:underline"
          >
            Google's Privacy Policy
          </a>
          .
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          What we store
        </h2>
        <p className="mt-2">
          We do not require account registration to read ATLAS. If you
          contact us directly, we store your email address and message only
          for as long as needed to respond, and we do not sell or share your
          personal information with third parties beyond the service
          providers described above (such as Google AdSense and Google
          Analytics).
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Contact us
        </h2>
        <p className="mt-2">
          If you have questions about this Privacy Policy or how your
          information is handled, email us at{" "}
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
