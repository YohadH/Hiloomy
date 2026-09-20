import type { Metadata } from "next";
import { Rubik, Heebo } from "next/font/google";
import { CreatorsLanding } from "@/components/marketing/creators/creators-landing";

// Public marketing landing for Hiloomy Creator — creator / affiliate
// management for Israeli e-commerce brands. Hebrew-first, RTL, standalone
// (listed in middleware PUBLIC_PATHS). Copy: owner, 20 Sep 2026 (third
// pass — "one system, both sides"). Everything shown as a capability exists
// in the affiliate portal.

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
  title: "Hiloomy Creator — מערכת אחת לניהול כל מערך המשפיענים שלכם, משני הצדדים",
  description:
    "העסק מנהל את המשפיענים, הקודים, המכירות והעמלות. המשפיענים מקבלים אזור אישי לביצועים שלהם. מתחבר ל־Shopify, ללא הגבלת משפיענים, 0% עמלה על המכירות.",
  alternates: { canonical: "https://hiloomy.com/creators" },
  openGraph: {
    title: "Hiloomy Creator — כל מערך המשפיענים שלכם, משני הצדדים",
    description: "כל קוד, לינק, הזמנה, מכירה ועמלה — במקום אחד. 0% עמלה על מכירות המשפיענים.",
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
