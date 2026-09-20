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
  title: "Hiloomy Creator — לא רק מי פרסם. מי באמת מכר.",
  description:
    "Hiloomy מרכזת במקום אחד את ניהול היוצרים, קודי הקופון, המכירות, הביצועים והעמלות, ולכל יוצרת יש אזור אישי משלה. מתחבר ל־Shopify, ללא הגבלת יוצרים, 0% עמלה על המכירות.",
  alternates: { canonical: "https://hiloomy.com/creators" },
  openGraph: {
    title: "Hiloomy Creator — לא רק מי פרסם. מי באמת מכר.",
    description: "יוצר → קוד → מוצר → מכירה → עמלה. שני הצדדים, מערכת אחת, 0% עמלה על המכירות.",
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
