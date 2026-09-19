import type { Metadata } from "next";
import { Rubik, Heebo } from "next/font/google";
import { CreatorsLanding } from "@/components/marketing/creators/creators-landing";

// Public marketing landing for Hiloomy Creator — creator / affiliate
// management for Israeli e-commerce brands. Hebrew-first, RTL, standalone
// (listed in middleware PUBLIC_PATHS). Copy and design brief: owner, 19 Sep
// 2026. Everything shown as a capability exists in the affiliate portal;
// future items carry a visible "בקרוב" badge.

const displayFont = Rubik({
  subsets: ["latin", "hebrew"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-cr-display",
  display: "swap"
});

const bodyFont = Heebo({
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cr-body",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Hiloomy Creator — ניהול מערך היוצרים והאפיליאייט של המותג, בלי עמלה על מכירות",
  description:
    "Hiloomy מקימה למותגי איקומרס מערכת לניהול יוצרים, קודים, לינקים, עמלות וביצועים במקום אחד. הקמה חד-פעמית, 250 ₪ לחודש, 0% עמלה על מכירות היוצרים.",
  alternates: { canonical: "https://hiloomy.com/creators" },
  openGraph: {
    title: "Hiloomy Creator — מערך היוצרים שלכם נשאר שלכם",
    description: "אנחנו מקימים לכם את מערך היוצרים. אתם נשארים הבעלים שלו. 0% עמלה על מכירות היוצרים.",
    url: "https://hiloomy.com/creators",
    locale: "he_IL",
    type: "website"
  }
};

export default function CreatorsPage() {
  return (
    <div className={`${displayFont.variable} ${bodyFont.variable}`}>
      <CreatorsLanding />
    </div>
  );
}
