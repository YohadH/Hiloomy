// Privacy Policy — tailored for an analytics SaaS that ingests Shopify
// orders, Meta Ads insights, and Instagram creator metrics on behalf of a
// merchant who installed the app.
//
// IMPORTANT: this is a working starting point that satisfies Meta's app
// review URL validation. Have a lawyer review before scaling beyond
// pilot customers. Update the [COMPANY] / [JURISDICTION] placeholders
// with your real legal entity name and registered jurisdiction.

export const metadata = {
  title: "Privacy Policy",
  description:
    "How we collect, use, store, and protect data when you use our Shopify analytics app."
};

export default function PrivacyPolicyPage() {
  const lastUpdated = "2026-06-08";
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-slate-800">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-xs text-slate-500">Last updated: {lastUpdated}</p>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">1. Who we are</h2>
        <p>
          This app (the &quot;Service&quot;) is operated by Brandzp Ltd
          (&quot;we&quot;, &quot;us&quot;). We provide an analytics dashboard
          for Shopify store owners (the &quot;Merchant&quot;). The Merchant
          connects their Shopify store, Meta Ads account, Instagram account,
          and affiliate platform to our Service, and we surface metrics back
          to them.
        </p>
        <p>
          You can reach us at{" "}
          <a className="text-sky-700 underline" href="mailto:yohad@brandzp.co.il">
            yohad@brandzp.co.il
          </a>
          .
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">2. What data we collect</h2>
        <p>
          When a Merchant connects their accounts, we receive and store the
          following categories of data:
        </p>
        <ul className="list-disc space-y-1 ps-6">
          <li>
            <strong>Shopify data:</strong> orders, line items, customers,
            products, refunds, discount codes, fulfilment events, and shop
            metadata.
          </li>
          <li>
            <strong>Meta Ads data:</strong> campaign and ad-level performance
            metrics, ad creative metadata, ad account information. We do not
            collect or store any personal data of end-users of the
            Merchant&apos;s ads.
          </li>
          <li>
            <strong>Instagram data:</strong> public posts and engagement
            metrics from Instagram creator accounts that the Merchant has
            connected.
          </li>
          <li>
            <strong>Affiliate data:</strong> affiliate names, contact
            emails, coupon codes, and order attribution records uploaded by
            the Merchant or received via partner webhooks (e.g. BixGrow).
          </li>
          <li>
            <strong>Authentication tokens:</strong> OAuth access tokens for
            the platforms above, encrypted at rest using AES-GCM.
          </li>
        </ul>
        <p>
          We do not run trackers or analytics on the Service that observe
          the Merchant&apos;s end-customers.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">3. How we use it</h2>
        <ul className="list-disc space-y-1 ps-6">
          <li>To display analytics dashboards to the Merchant.</li>
          <li>
            To generate weekly performance reports (PDF + email) for the
            Merchant.
          </li>
          <li>
            To run anomaly detection (e.g. flagging products about to run
            out of stock) and surface recommendations.
          </li>
          <li>
            To compute aggregated industry benchmarks. Benchmarks never
            expose any individual Merchant&apos;s data.
          </li>
        </ul>
        <p>
          We never sell data. We never share data with third parties for
          their own marketing purposes.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">4. Where it lives</h2>
        <p>
          Data is stored in Supabase (managed PostgreSQL), hosted in the EU
          (Frankfurt region). Application servers run on Render. Email
          delivery uses Resend. We do not transfer Merchant data to other
          third-party services beyond the providers explicitly listed in
          this policy.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">4a. Competitor intelligence (RivalSweeper)</h2>
        <p>
          The app can display competitive-intelligence signals (public promotions,
          advertising activity, and press mentions of competitor websites) supplied
          by RivalSweeper, a third-party data provider. This integration is strictly
          one-directional: the only information we send RivalSweeper is the list of
          competitor <em>domain names</em> the Merchant chose to monitor — public
          website addresses, not personal data. No store data, order data, customer
          data, or any other Merchant information is ever transmitted to
          RivalSweeper or any other data provider.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">5. How long we keep it</h2>
        <p>
          We retain data for as long as the Merchant maintains an active
          connection. When the Merchant uninstalls the Shopify app, access
          credentials are revoked immediately, and upon receiving
          Shopify&apos;s <code className="rounded bg-slate-100 px-1">shop/redact</code>{" "}
          notice (sent ~48 hours after uninstall) all store data — orders,
          customers, products, and derived analytics — is permanently deleted.
          Customer-level redaction requests
          (<code className="rounded bg-slate-100 px-1">customers/redact</code>) are
          honored by deleting that customer&apos;s personal data while retaining
          anonymous financial records, and data-access requests
          (<code className="rounded bg-slate-100 px-1">customers/data_request</code>)
          are logged and fulfilled with the Merchant. For other integrations
          (e.g. Meta Ads), tokens are deleted within 7 days of disconnection
          and the underlying data within 90 days, unless the Merchant
          requests earlier deletion.
        </p>
        <p>
          We retain backups for up to 30 days, after which they are
          purged.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">6. Your rights</h2>
        <p>
          You may request access to, correction of, or deletion of any
          personal data we hold about you by emailing{" "}
          <a className="text-sky-700 underline" href="mailto:yohad@brandzp.co.il">
            yohad@brandzp.co.il
          </a>
          . We will respond within 30 days.
        </p>
        <p>
          If you are a Facebook user and want us to delete data we received
          via the Meta Ads connection, you can also use Facebook&apos;s data
          deletion flow, which automatically triggers our endpoint at{" "}
          <code className="rounded bg-slate-100 px-1">
            /api/meta/data-deletion
          </code>
          . See section 9 below.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">7. Security</h2>
        <p>
          All third-party access tokens are encrypted at rest using AES-GCM
          with a 256-bit key. All network connections use TLS 1.2 or
          higher. Database access is restricted to the application server
          and a small set of named administrators. We log access to
          sensitive operations.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">8. Children</h2>
        <p>
          The Service is intended for use by businesses. We do not
          knowingly collect personal data from individuals under 16.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">
          9. Meta / Facebook data deletion
        </h2>
        <p>
          We comply with the Meta Platform Terms requirement to provide a
          User Data Deletion mechanism. Submit a deletion request via
          Facebook&apos;s account settings; Facebook will POST a signed
          request to our endpoint at{" "}
          <code className="rounded bg-slate-100 px-1">
            /api/meta/data-deletion
          </code>
          . We respond with a unique confirmation code and a status URL you
          can use to track completion. Deletion of stored Meta data
          completes within 7 days.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">10. Changes</h2>
        <p>
          We may update this policy from time to time. The &quot;Last
          updated&quot; date at the top reflects the most recent revision.
          Material changes will be announced via email to the Merchant
          contact on file.
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
