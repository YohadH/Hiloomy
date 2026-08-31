import type { Metadata } from "next";
import { Rubik, Heebo } from "next/font/google";
import CompanyLanding from "@/components/marketing/company-landing";

// Public marketing landing. Served at "/" for anonymous visitors (middleware
// rewrite) and directly at /welcome.
//
// Design (Aug 2026): the "company" redesign — repositioned around
// "כל העסק שלכם. החלטה אחת ברורה." Hiloomy connects Shopify, ads, content,
// competitors, influencers and the rest of a brand's data into one clear
// picture, then tells the operator the next move. The page itself lives in
// components/marketing/company-landing.{tsx,data.js}; this file wires fonts
// and metadata and mounts it.
//
// Note: Hebrew-first. The English (?lang=en) variant is not yet ported to this
// design — a follow-up. The previous bilingual "broadsheet" page is kept at
// app/welcome/_page.broadsheet.bak for reference.

const displayFont = Rubik({
  subsets: ["latin", "hebrew"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-hl-display",
  display: "swap"
});

const bodyFont = Heebo({
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hl-body",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Hiloomy — כל העסק שלכם, החלטה אחת ברורה",
  description:
    "Hiloomy מחברת את Shopify, הפרסום, התוכן, המתחרים והמשפיענים של המותג שלכם לתמונה אחת — ומראה מה קורה, למה, ומה כדאי לעשות עכשיו כדי לצמוח."
};

export default function WelcomePage() {
  return (
    <div className={`${displayFont.variable} ${bodyFont.variable}`}>
      <CompanyLanding />
    </div>
  );
}
