import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { MyDashboard } from "@/components/my-dashboard/my-dashboard";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { buildCustomDashboard } from "@/lib/services/custom-dashboard-service";
import { getAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata = { title: "My dashboard — Hiloomy" };

// The merchant's own board. Hiloomy decides what deserves attention on
// Today; this is where the merchant says what THEY want to keep an eye on.
export default async function MyDashboardPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const storeId = await resolveActiveStoreId();
  if (!storeId) redirect("/dashboard" as never);
  const [chrome, board] = await Promise.all([getAppChromeData(), buildCustomDashboard(storeId)]);

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-6">
        <PageHead
          eyebrow={t("הדשבורד שלי", "My dashboard")}
          title={t("המוצרים שאתם עוקבים אחריהם", "The products you follow")}
          description={t(
            "בחרו מוצרים ועקבו אחרי המלאי במיקומים שהגדרתם, קצב המכירה, ימי הכיסוי והמכירה האחרונה. הגדירו סף לכל מוצר כדי לקבל סימון כשהמלאי יורד מתחתיו.",
            "Pick products and follow stock at your chosen locations, sales pace, days of cover and last sale. Set a threshold per product to get flagged when stock drops below it."
          )}
        />
        <MyDashboard locale={isHe ? "he" : "en"} initial={board} />
      </div>
    </AppShell>
  );
}
