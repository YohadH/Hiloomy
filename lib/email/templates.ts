// Transactional email templates. Each returns `{ subject, html }` for a
// specific locale. All HTML is inline-styled (no <style> blocks) so it
// survives Gmail/Outlook/Apple Mail rendering quirks.
//
// Templates take a typed `data` object — no interpolation surprises.
// All strings localized to he/en.

export type EmailLocale = "he" | "en";

const BRAND = "Hiloomy";
const BRAND_COLOR = "#16A34A";

interface EmailShell {
  title: string;
  intro: string;
  cta?: { label: string; url: string };
  body: string[]; // paragraphs
  footer?: string;
  locale: EmailLocale;
}

function renderShell({ title, intro, cta, body, footer, locale }: EmailShell): string {
  const dir = locale === "he" ? "rtl" : "ltr";
  const align = locale === "he" ? "right" : "left";
  const ctaHtml = cta
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
      <tr>
        <td style="background-color: ${BRAND_COLOR}; border-radius: 8px;">
          <a href="${cta.url}" style="display: inline-block; padding: 12px 24px; color: #ffffff; font-weight: 600; text-decoration: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px;">${cta.label}</a>
        </td>
      </tr>
    </table>`
    : "";
  const bodyHtml = body
    .map(
      (p) =>
        `<p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">${p}</p>`
    )
    .join("\n");
  const footerHtml = footer
    ? `<p style="margin: 24px 0 0 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">${footer}</p>`
    : "";
  return `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden;">
          <tr>
            <td style="padding: 32px 32px 16px 32px;">
              <div style="display: inline-block; vertical-align: middle;">
                <img src="https://hiloomy.com/hiloomy-mark.png" width="28" height="28" alt="${BRAND}" style="display: inline-block; vertical-align: middle; border: 0;" />
                <span style="font-weight: 700; font-size: 16px; color: #1b4332; vertical-align: middle; margin: 0 8px;">${BRAND}<span style="color: #f97316;">.</span></span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px; text-align: ${align};" dir="${dir}">
              <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">${title}</h1>
              <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">${intro}</p>
              ${bodyHtml}
              ${ctaHtml}
              ${footerHtml}
            </td>
          </tr>
        </table>
        <p style="margin: 16px 0 0 0; color: #94a3b8; font-size: 11px;">
          ${BRAND} · ${locale === "he" ? "תל אביב, ישראל" : "Tel Aviv, Israel"}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Welcome email ─────────────────────────────────────────────────
export function welcomeEmail(data: { displayName: string | null; appUrl: string; locale: EmailLocale }) {
  const greeting = data.displayName ? data.displayName : data.locale === "he" ? "שלום" : "Hi there";
  if (data.locale === "he") {
    return {
      subject: "ברוכים הבאים לHiloomy 👋",
      html: renderShell({
        title: `${greeting}, ברוכים הבאים!`,
        intro:
          "תודה שנרשמתם לHiloomy. אתם 14 ימי ניסיון בחינם משימוש מלא בלוח הבקרה.",
        body: [
          "כדי להתחיל, חברו את חנות Shopify שלכם. תוך פחות מדקה תראו את הנתונים — הכנסות, רווח, קמפיינים, חזרת לקוחות, ושותפים.",
          "אם תקועים, אנחנו זמינים: השיבו לאימייל הזה ונחזור אליכם."
        ],
        cta: { label: "חברו חנות Shopify", url: `${data.appUrl}/connect-brand` },
        footer: "אם לא נרשמתם, התעלמו מהאימייל הזה.",
        locale: "he"
      })
    };
  }
  return {
    subject: "Welcome to Hiloomy 👋",
    html: renderShell({
      title: `${greeting}, welcome!`,
      intro:
        "Thanks for signing up to Hiloomy. You're 14 days into a free trial with full access to the dashboard.",
      body: [
        "To get started, connect your Shopify store. In under a minute you'll see your numbers — revenue, profit, campaigns, retention, and affiliates.",
        "Stuck? Reply to this email — a real human reads them."
      ],
      cta: { label: "Connect your Shopify", url: `${data.appUrl}/connect-brand` },
      footer: "If you didn't sign up, ignore this email.",
      locale: "en"
    })
  };
}

// ─── Trial ending email ────────────────────────────────────────────
export function trialEndingEmail(data: {
  displayName: string | null;
  appUrl: string;
  daysLeft: number;
  locale: EmailLocale;
}) {
  if (data.locale === "he") {
    return {
      subject: `נותרו ${data.daysLeft} ימים בניסיון שלכם`,
      html: renderShell({
        title: `תקופת הניסיון שלכם מסתיימת בעוד ${data.daysLeft} ימים`,
        intro:
          "כדי להמשיך לקבל גישה לניתוחים, להתראות ולדוחות, בחרו במסלול שמתאים לכם.",
        body: [
          "המסלולים מתחילים ב179 ש\"ח לחודש. אפשר לבטל בכל רגע. ללא התחייבות.",
          "אם יש שאלות לפני שתחליטו — השיבו לאימייל הזה."
        ],
        cta: { label: "בחרו מסלול", url: `${data.appUrl}/billing` },
        locale: "he"
      })
    };
  }
  return {
    subject: `Your trial ends in ${data.daysLeft} days`,
    html: renderShell({
      title: `Your trial ends in ${data.daysLeft} days`,
      intro: "Keep your analytics, alerts, and reports running by choosing a plan.",
      body: [
        "Plans start at $49/month. Cancel anytime. No commitment.",
        "Got questions before deciding? Reply to this email."
      ],
      cta: { label: "Choose a plan", url: `${data.appUrl}/billing` },
      locale: "en"
    })
  };
}

// ─── Subscription started email ────────────────────────────────────
export function subscriptionStartedEmail(data: {
  displayName: string | null;
  planName: string;
  appUrl: string;
  locale: EmailLocale;
}) {
  if (data.locale === "he") {
    return {
      subject: `המנוי שלכם פעיל — ${data.planName}`,
      html: renderShell({
        title: `המנוי שלכם פעיל 🎉`,
        intro: `אתם רשומים למסלול ${data.planName}. הנה מה שעכשיו זמין לכם:`,
        body: [
          "כל הלוחות, ההתראות, והדוחות פתוחים ללא הגבלה.",
          "החיוב הראשון יישלח אליכם מStripe — חיפשו אימייל מהם.",
          "לניהול אמצעי תשלום, הורדת חשבוניות, או שינוי מסלול — כנסו לעמוד הביצוע."
        ],
        cta: { label: "פתחו את הדשבורד", url: data.appUrl },
        locale: "he"
      })
    };
  }
  return {
    subject: `Your subscription is active — ${data.planName}`,
    html: renderShell({
      title: "Your subscription is active 🎉",
      intro: `You're on the ${data.planName} plan. Here's what's now unlocked:`,
      body: [
        "All dashboards, alerts, and reports — no limits.",
        "Your first invoice receipt is on the way from Stripe.",
        "To manage payment method, download invoices, or change plans — visit the billing page."
      ],
      cta: { label: "Open the dashboard", url: data.appUrl },
      locale: "en"
    })
  };
}

// ─── Team invitation email ─────────────────────────────────────────
export function teamInvitationEmail(data: {
  inviterName: string;
  orgName: string;
  acceptUrl: string;
  locale: EmailLocale;
}) {
  if (data.locale === "he") {
    return {
      subject: `${data.inviterName} הזמין/ה אתכם להצטרף ל-${data.orgName} בHiloomy`,
      html: renderShell({
        title: `הוזמנתם להצטרף ל-${data.orgName}`,
        intro: `${data.inviterName} הזמין/ה אתכם להיות חברים בארגון ${data.orgName} בHiloomy.`,
        body: [
          "ההזמנה תקפה ל14 ימים. אחרי קבלת ההזמנה תוכלו לראות ולנהל את הנתונים של הארגון.",
          "אם אין לכם עדיין חשבון, נצור לכם אחד אוטומטית."
        ],
        cta: { label: "קבלו את ההזמנה", url: data.acceptUrl },
        locale: "he"
      })
    };
  }
  return {
    subject: `${data.inviterName} invited you to join ${data.orgName} on Hiloomy`,
    html: renderShell({
      title: `You've been invited to ${data.orgName}`,
      intro: `${data.inviterName} invited you to join the ${data.orgName} organization on Hiloomy.`,
      body: [
        "This invitation is valid for 14 days. Once you accept, you'll see and manage the organization's data.",
        "If you don't have a Hiloomy account yet, we'll create one for you."
      ],
      cta: { label: "Accept invitation", url: data.acceptUrl },
      locale: "en"
    })
  };
}

// ─── Subscription canceled email ───────────────────────────────────
export function subscriptionCanceledEmail(data: {
  displayName: string | null;
  appUrl: string;
  locale: EmailLocale;
}) {
  if (data.locale === "he") {
    return {
      subject: "המנוי שלכם בוטל",
      html: renderShell({
        title: "המנוי שלכם בוטל",
        intro: "הנתונים שלכם נשמרו ויהיו זמינים אם תחליטו לחזור.",
        body: [
          "אתם תאבדו גישה ללוחות בסיום תקופת החיוב הנוכחית.",
          "אם בוטל בטעות, או יש משוב — השיבו לאימייל הזה. נשמח לשמוע."
        ],
        cta: { label: "מנהול חיוב", url: `${data.appUrl}/billing` },
        locale: "he"
      })
    };
  }
  return {
    subject: "Your subscription has been canceled",
    html: renderShell({
      title: "Your subscription has been canceled",
      intro: "Your data is preserved and waiting if you decide to come back.",
      body: [
        "You'll lose dashboard access at the end of the current billing period.",
        "If this was an accident, or you have feedback — reply to this email. We'd love to hear it."
      ],
      cta: { label: "Manage billing", url: `${data.appUrl}/billing` },
      locale: "en"
    })
  };
}
