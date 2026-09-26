import type { Metadata, Viewport } from "next";
import { Rubik, Heebo } from "next/font/google";
import { CreatorsLanding } from "@/components/marketing/creators/creators-landing";

// Public marketing landing for Hiloomy Creator, served at /creators on
// hiloomy.com. Ported verbatim from the Creators project's `landing-redesign`
// branch (commit 9df6df4, 2026-09-26); only the mount differs: there the page
// is the domain root and the fonts live in the root layout, here the fonts
// are scoped to this page. Hebrew-first, RTL, standalone (middleware
// PUBLIC_PATHS). No login/signup links — this domain has no creator app.

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
  title: { absolute: "Hiloomy Creator — מכירות ועמלות משפיענים בלי אקסל" },
  description:
    "Hiloomy משייכת מכירות למשפיענים לפי הקודים והלינקים הקיימים, מחשבת עמלות ומרכזת סטטוסי תשלום. 0% עמלה ל־Hiloomy על המכירות.",
  alternates: { canonical: "https://hiloomy.com/creators" },
  openGraph: {
    title: "Hiloomy Creator — מכירות ועמלות משפיענים בלי אקסל",
    description: "Hiloomy מחברת קודי קופון ולינקים לחנות ומשייכת מכירות לכל משפיען. ביצועים ועמלות במקום אחד. 0% עמלה ל־Hiloomy על המכירות.",
    url: "https://hiloomy.com/creators",
    locale: "he_IL",
    type: "website"
  }
};

// Mobile browser chrome matches the dark hero (= --night in creators-landing.css).
export const viewport: Viewport = { themeColor: "#0b0d0c" };

export default function CreatorsPage() {
  return (
    <div className={`${displayFont.variable} ${bodyFont.variable}`}>
      <CreatorsLanding />
    </div>
  );
}
