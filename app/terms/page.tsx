// Terms of Service — Hiloomy.
//
// Satisfies Shopify App Store, Meta, and Google review URL checks. Have
// counsel review before customers beyond the pilot.

export const metadata = {
  title: "Hiloomy — Terms of Service",
  description: "Terms governing your use of Hiloomy, the Shopify profit analytics app."
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function TermsOfServicePage() {
  const lastUpdated = "2026-08-20";
  return (
    <main dir="ltr" className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-slate-800">
      <h1 className="text-3xl font-bold tracking-tight">Hiloomy — Terms of Service</h1>
      <p className="mt-1 text-xs text-slate-500">Last updated: {lastUpdated}</p>

      <Section title="1. Acceptance">
        <p>
          By creating an account, installing the Shopify app, or using{" "}
          <strong>Hiloomy</strong> (the &quot;Service&quot;, at www.hiloomy.com),
          you agree to these Terms (&quot;we&quot;, &quot;us&quot; refer to
          Hiloomy).
        </p>
      </Section>

      <Section title="2. What Hiloomy provides">
        <p>
          Hiloomy is a profit-analytics and growth-reporting platform for
          Shopify brands. With your authorization it connects to your Shopify
          store and, optionally, your Meta Ads, Instagram, and Google Search
          Console accounts, and computes profit, retention, alerts, weekly
          reports, affiliate-program tracking, and competitor insights (from
          public sources only — see our Privacy Policy).
        </p>
        <p>
          Analytics, alerts, and recommendations are decision support, not
          financial advice. We do not guarantee that any metric, recommendation,
          or report will produce a particular business outcome, and figures such
          as estimated profit depend on the cost inputs you configure.
        </p>
      </Section>

      <Section title="3. Your responsibilities">
        <ul className="list-disc space-y-1 ps-6">
          <li>Keep your login credentials secure; you are responsible for activity under your account and team.</li>
          <li>Connect only accounts and properties you own or are authorized to connect.</li>
          <li>Track only competitor domains you are entitled to monitor publicly.</li>
          <li>Use the Service lawfully, including compliance with Shopify&apos;s, Meta&apos;s, and Google&apos;s terms for your connected accounts.</li>
          <li>Do not attempt to access other customers&apos; data, probe, or disrupt the Service.</li>
        </ul>
      </Section>

      <Section title="4. Your data">
        <p>
          You own your store and marketing data. You grant us the limited right
          to process it solely to provide the Service to you, as described in
          our{" "}
          <a className="text-sky-700 underline" href="/privacy">
            Privacy Policy
          </a>
          . We never sell your data and never use it as competitive intelligence
          for anyone else. Disconnecting a source or uninstalling the app
          revokes our access; you may request full deletion at any time.
        </p>
      </Section>

      <Section title="5. Plans, trials, and billing">
        <p>
          Paid plans are billed as presented at checkout. Trials convert only if
          you actively subscribe; you can cancel anytime, effective at the end
          of the current billing period. We may change pricing with advance
          notice; changes never apply retroactively to a paid period.
        </p>
      </Section>

      <Section title="6. Availability and changes">
        <p>
          We aim for high availability but the Service is provided &quot;as
          is&quot; and &quot;as available&quot;. We may add, change, or remove
          features. Data syncs depend on third-party APIs (Shopify, Meta,
          Google) whose availability we do not control.
        </p>
      </Section>

      <Section title="7. Limitation of liability">
        <p>
          To the maximum extent permitted by law, our aggregate liability
          arising out of the Service is limited to the amounts you paid us in
          the twelve months preceding the claim. We are not liable for indirect,
          incidental, or consequential damages, including lost profits or
          business decisions taken on the basis of analytics or
          recommendations.
        </p>
      </Section>

      <Section title="8. Termination">
        <p>
          You may stop using the Service and uninstall at any time. We may
          suspend or terminate accounts that materially breach these Terms,
          with notice where practicable. Sections 4, 7, and 9 survive
          termination.
        </p>
      </Section>

      <Section title="9. Governing law">
        <p>
          These Terms are governed by the laws of the State of Israel, and the
          competent courts of Tel Aviv have exclusive jurisdiction, without
          prejudice to mandatory consumer protections in your place of
          residence.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Questions about these Terms:{" "}
          <a className="text-sky-700 underline" href="mailto:yoadhakimv@gmail.com">
            yoadhakimv@gmail.com
          </a>
        </p>
      </Section>
    </main>
  );
}
