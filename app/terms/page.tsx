// Terms of Service — starting point for an analytics SaaS that ingests
// data on the Merchant's behalf. Satisfies Meta's app review URL check.
//
// IMPORTANT: have counsel review before customers beyond your pilot. Adjust
// the entity name + jurisdiction to your real registration.

export const metadata = {
  title: "Terms of Service",
  description:
    "Terms governing your use of the Shopify analytics app."
};

export default function TermsOfServicePage() {
  const lastUpdated = "2026-06-08";
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-slate-800">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-1 text-xs text-slate-500">Last updated: {lastUpdated}</p>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">1. Acceptance</h2>
        <p>
          By installing or using this application (the &quot;Service&quot;),
          you agree to be bound by these Terms. The Service is operated by
          Brandzp Ltd, registered in Israel (&quot;we&quot;, &quot;us&quot;).
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">2. What we provide</h2>
        <p>
          The Service is a Shopify-integrated analytics platform. It
          connects to your Shopify store, Meta Ads account, Instagram
          account, and affiliate platforms (via your authorization), and
          surfaces aggregated performance metrics, reports, and
          recommendations.
        </p>
        <p>
          We do not guarantee that any specific metric, recommendation, or
          report will produce a particular business outcome.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">3. Your obligations</h2>
        <ul className="list-disc space-y-1 ps-6">
          <li>
            You will only connect platforms that you own or are authorized
            to administer.
          </li>
          <li>
            You will not use the Service to violate the terms of any
            connected platform (Shopify, Meta, Instagram, BixGrow, etc.).
          </li>
          <li>
            You will not attempt to access data belonging to other
            Merchants, reverse-engineer, scrape, or otherwise abuse the
            Service.
          </li>
          <li>
            You are responsible for maintaining the security of credentials
            (e.g. user accounts) used to access the Service.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">4. Data ownership</h2>
        <p>
          You retain all rights to the data you connect to the Service
          (orders, ads data, affiliate data, etc.). By using the Service,
          you grant us a limited license to process that data solely to
          provide the Service to you, including:
        </p>
        <ul className="list-disc space-y-1 ps-6">
          <li>Computing analytics and reports for your account.</li>
          <li>Storing the data on our servers (see Privacy Policy).</li>
          <li>
            Producing aggregated, anonymized benchmarks. Benchmarks never
            expose your data to other Merchants.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">5. Fees and payment</h2>
        <p>
          Current pricing, including any free tier, is presented at sign-up
          and at any time on our pricing page. Fees are billed in advance
          monthly or annually as selected. Failure to pay may result in
          suspension of the Service after a 14-day grace period.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">6. Termination</h2>
        <p>
          You may terminate your use of the Service at any time by
          disconnecting all integrations and (if applicable) cancelling
          your subscription. We may terminate your access if you breach
          these Terms or use the Service in a way that risks harm to other
          Merchants or to integrated platforms.
        </p>
        <p>
          On termination, your data will be deleted according to the
          schedule described in the Privacy Policy.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">7. Disclaimers</h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of
          any kind. We do not guarantee uninterrupted availability or that
          third-party platforms (Shopify, Meta, etc.) will remain
          accessible.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">
          8. Limitation of liability
        </h2>
        <p>
          To the maximum extent permitted by law, our aggregate liability
          for any claim arising out of these Terms or the Service is
          limited to the fees you paid in the 12 months preceding the
          claim. We are not liable for indirect, incidental, special,
          consequential, or punitive damages.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">9. Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of Israel.
          Disputes will be resolved in the competent courts of Tel
          Aviv-Jaffa.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">10. Changes to these Terms</h2>
        <p>
          We may revise these Terms from time to time. Material changes
          will be communicated via email at least 30 days in advance, and
          will not apply retroactively.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">11. Contact</h2>
        <p>
          Brandzp Ltd · Gil Yam, Herzliya, Israel ·{" "}
          <a className="text-sky-700 underline" href="mailto:yohad@brandzp.co.il">
            yohad@brandzp.co.il
          </a>
        </p>
      </section>
    </main>
  );
}
