import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { getAppLocale, getLocaleDirection } from "@/lib/i18n";
import { CookieBanner } from "@/components/compliance/cookie-banner";
import { PlausibleScript } from "@/components/compliance/plausible-script";
import { Toaster } from "@/components/ui/toast";

export const metadata: Metadata = {
  // Production domain — hiloomy.com. Makes OG/twitter image and canonical
  // URLs resolve absolutely. The favicon comes from app/icon.svg
  // (file-based metadata), which overrides any icons config here.
  metadataBase: new URL("https://hiloomy.com"),
  title: "Hiloomy — Founder Analytics for Shopify",
  description:
    "Founder-friendly Shopify analytics focused on profit visibility, retention insight, and weekly reporting.",
  openGraph: {
    siteName: "Hiloomy",
    url: "https://hiloomy.com",
    images: ["/hiloomy-mark.svg"]
  }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getAppLocale();
  const localeFor = locale === "he" ? "he" : "en";

  // Suppress in-app chrome (toaster, cookie banner, analytics) on print
  // routes. These pages are consumed by the headless PDF renderer or
  // opened in a browser strictly for print; the cookie widget in
  // particular was leaking into every generated PDF as a footer band.
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const isPrintRoute = pathname.startsWith("/print");

  return (
    <html lang={locale} dir={getLocaleDirection(locale)}>
      <body>
        {children}
        {isPrintRoute ? null : (
          <>
            <Toaster locale={localeFor} />
            <CookieBanner locale={localeFor} />
            <PlausibleScript />
          </>
        )}
      </body>
    </html>
  );
}
