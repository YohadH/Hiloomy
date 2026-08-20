// Privacy Policy — Hiloomy (operated by Brandzp Ltd).
//
// Written to satisfy Shopify App Store review, Meta app review, and Google
// OAuth verification (Google API Services User Data Policy / Limited Use).
// The competitor-intelligence section is deliberately explicit: competitor
// insights come ONLY from publicly available sources; merchant store data
// is never shared with the competitor-monitoring provider and never used
// as intelligence for anyone else.
//
// Have a lawyer review before scaling beyond pilot customers.

export const metadata = {
  title: "Hiloomy — Privacy Policy",
  description:
    "How Hiloomy collects, uses, stores, and protects data when you use our Shopify profit analytics app."
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPolicyPage() {
  const lastUpdated = "2026-08-20";
  return (
    <main dir="ltr" className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-slate-800">
      <h1 className="text-3xl font-bold tracking-tight">Hiloomy — Privacy Policy</h1>
      <p className="mt-1 text-xs text-slate-500">Last updated: {lastUpdated}</p>

      <Section title="1. Who we are">
        <p>
          <strong>Hiloomy</strong> (the &quot;Service&quot;, available at{" "}
          <a className="text-sky-700 underline" href="https://www.hiloomy.com">
            www.hiloomy.com
          </a>
          ) is a profit-analytics and growth-reporting application for Shopify
          brands, operated by <strong>Brandzp Ltd</strong> (&quot;we&quot;,
          &quot;us&quot;), a company registered in Israel. A merchant (the
          &quot;Merchant&quot;) connects their Shopify store and, optionally,
          marketing accounts; Hiloomy computes profit, retention, alerts, and a
          weekly report from that data and shows it back to the Merchant only.
        </p>
        <p>
          Contact:{" "}
          <a className="text-sky-700 underline" href="mailto:yoadhakimv@gmail.com">
            yoadhakimv@gmail.com
          </a>
        </p>
      </Section>

      <Section title="2. What data we collect">
        <p>When a Merchant connects their accounts, we receive and store:</p>
        <ul className="list-disc space-y-1 ps-6">
          <li>
            <strong>Shopify data (read-only):</strong> orders, line items,
            customers, products, inventory, refunds, and discount usage, plus
            shop metadata. Our Shopify access is read-only, with one exception:
            the optional affiliate module can create discount codes in the
            Merchant&apos;s store when the Merchant explicitly requests it
            (write_discounts scope).
          </li>
          <li>
            <strong>Meta Ads data (optional):</strong> campaign- and ad-level
            performance metrics and creative metadata from the Merchant&apos;s
            own ad account. We do not collect personal data of people who see
            the Merchant&apos;s ads.
          </li>
          <li>
            <strong>Instagram data (optional):</strong> the Merchant&apos;s own
            professional-account media and engagement metrics.
          </li>
          <li>
            <strong>Google Search Console data (optional):</strong> aggregated
            search performance for the Merchant&apos;s own verified site —
            queries, clicks, impressions, and positions. See section 4 for our
            Google data commitments.
          </li>
          <li>
            <strong>Affiliate data (optional):</strong> affiliate names, contact
            details the Merchant provides, coupon codes, tracked-link clicks,
            and attributed orders.
          </li>
          <li>
            <strong>Account data:</strong> the Merchant&apos;s login email,
            organization and team-member details, and preferences.
          </li>
        </ul>
      </Section>

      <Section title="3. How we use data">
        <ul className="list-disc space-y-1 ps-6">
          <li>To compute the Merchant&apos;s own analytics: profit, contribution margin, retention, alerts, and reports.</li>
          <li>To generate and email the Merchant&apos;s weekly growth report.</li>
          <li>To operate the Merchant&apos;s affiliate program (attribution, commissions, payout bookkeeping).</li>
          <li>To provide support and maintain the security of the Service.</li>
        </ul>
        <p>
          <strong>We never sell data.</strong> We never use one Merchant&apos;s
          data to benefit another Merchant, to build cross-merchant benchmarks,
          or to train models. Each Merchant&apos;s data is isolated at the
          database level and visible only to their own team.
        </p>
      </Section>

      <Section title="4. Google user data (Google API Services)">
        <p>
          When the Merchant connects Google Search Console, Hiloomy accesses
          only read-only search-performance data for the Merchant&apos;s own
          verified property. Hiloomy&apos;s use of information received from
          Google APIs adheres to the{" "}
          <a
            className="text-sky-700 underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Specifically: Google data is
          used only to display the Merchant&apos;s own search analytics inside
          Hiloomy and in their weekly report; it is never transferred to third
          parties, never used for advertising, and never read by humans except
          with the Merchant&apos;s explicit consent for support, for security, or
          to comply with law. Disconnecting Google in Settings revokes our
          access and deletes stored Google tokens.
        </p>
      </Section>

      <Section title="5. Competitor insights — public sources only">
        <p>
          Hiloomy can show the Merchant what their competitors are doing
          (promotions, discounts, homepage messages). This intelligence is
          compiled <strong>exclusively from publicly available information</strong>{" "}
          on the competitors&apos; own public websites, collected via our
          monitoring provider (RivalSweeper).
        </p>
        <ul className="list-disc space-y-1 ps-6">
          <li>
            <strong>We never send any Merchant store data to the competitor-monitoring
            provider.</strong> The only information shared with it is the list of
            public competitor domains the Merchant chose to track.
          </li>
          <li>
            <strong>Your store is never anyone else&apos;s &quot;competitor
            intelligence&quot;.</strong> Hiloomy does not use, expose, or derive
            insights from one Merchant&apos;s private store data for any other
            customer — ever.
          </li>
          <li>
            Competitor insights shown in Hiloomy contain no personal data — only
            public promotional signals.
          </li>
        </ul>
      </Section>

      <Section title="6. Where data is stored and how it is protected">
        <ul className="list-disc space-y-1 ps-6">
          <li>Data is hosted in the EU (database: Supabase, Frankfurt; application: Render).</li>
          <li>Access tokens and API secrets are encrypted at rest (AES-256-GCM) and never leave the server.</li>
          <li>Every customer is isolated at the database level; internal access is restricted and logged.</li>
          <li>All traffic is encrypted in transit (TLS).</li>
        </ul>
      </Section>

      <Section title="7. Sharing and subprocessors">
        <p>We share data only with the processors needed to run the Service:</p>
        <ul className="list-disc space-y-1 ps-6">
          <li>Supabase (database and authentication, EU)</li>
          <li>Render (application hosting)</li>
          <li>Resend (transactional email — weekly reports, notifications)</li>
          <li>Shopify, Meta, and Google — only as the Merchant&apos;s connected sources, under their own terms</li>
          <li>RivalSweeper — receives only public competitor domains to monitor (see section 5)</li>
        </ul>
        <p>We do not sell or rent data to anyone.</p>
      </Section>

      <Section title="8. Retention and deletion">
        <ul className="list-disc space-y-1 ps-6">
          <li>Data is retained while the Merchant&apos;s account is active.</li>
          <li>
            Disconnecting a source in Settings stops collection and deletes its
            stored tokens. Uninstalling the Shopify app revokes our store access
            immediately.
          </li>
          <li>
            On account deletion request (email us), we delete the
            Merchant&apos;s data within 30 days, except records we must keep by
            law.
          </li>
          <li>
            We honor Shopify&apos;s GDPR webhooks (customer data request,
            customer redact, shop redact) automatically, and Meta&apos;s data
            deletion callback.
          </li>
        </ul>
      </Section>

      <Section title="9. Your rights">
        <p>
          Depending on your jurisdiction (including GDPR where applicable), you
          may request access, correction, export, or deletion of your personal
          data by emailing{" "}
          <a className="text-sky-700 underline" href="mailto:yoadhakimv@gmail.com">
            yoadhakimv@gmail.com
          </a>
          . End customers of a Merchant&apos;s store should direct requests to
          the Merchant, who controls that data; we assist the Merchant as
          processor.
        </p>
      </Section>

      <Section title="10. Changes">
        <p>
          We may update this policy as the Service evolves. Material changes are
          announced in-app or by email, and the date above is updated.
        </p>
      </Section>
    </main>
  );
}
