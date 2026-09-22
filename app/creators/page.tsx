import type { Metadata } from "next";
import { Rubik, Heebo } from "next/font/google";
import { CreatorsLanding } from "@/components/marketing/creators/creators-landing";

// Public marketing landing for Hiloomy Creator — creator / affiliate
// management for Israeli e-commerce brands. Hebrew-first, RTL, standalone
// (listed in middleware PUBLIC_PATHS). Copy: owner, 20 Sep 2026 (fourth
// pass — six sections, "לא רק מי פרסם. מי באמת מכר."). Everything shown as
// a capability exists in the affiliate portal.

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
  title: "Hiloomy Creator — מנהלים משפיענים? תדעו בדיוק כמה כל אחד מכר.",
  description:
    "Hiloomy מחברת את החנות, קודי הקופון, הלינקים והמכירות ומשייכת את הפעילות לכל משפיען. ביצועים, עמלות וסטטוסי תשלום במקום אחד. הטמעה על הפעילות הקיימת, 0% עמלה ל-Hiloomy על המכירות.",
  alternates: { canonical: "https://hiloomy.com/creators" },
  openGraph: {
    title: "Hiloomy Creator — מנהלים משפיענים? תדעו בדיוק כמה כל אחד מכר.",
    description: "Hiloomy מחברת את קודי הקופון והלינקים ל-Shopify ומשייכת את המכירות למשפיען הרלוונטי. מכירות, ביצועים ועמלות במקום אחד. 0% עמלה על המכירות.",
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
