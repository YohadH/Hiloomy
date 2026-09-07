import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { DecisionPage } from "@/components/decisions/decision-page";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getDecision } from "@/lib/services/decision-inbox-service";
import { getAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Deep link to one Decision Receipt. Works for open and decided decisions
// alike — Memory links here.
export default async function DecisionReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const storeId = await resolveActiveStoreId();
  if (!storeId) redirect("/dashboard" as never);
  const { id } = await params;
  const [chrome, decision] = await Promise.all([getAppChromeData(), getDecision(storeId, id)]);
  if (!decision) notFound();

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-6">
        <Link
          href={"/today" as never}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
          {isHe ? "חזרה לתיבת ההחלטות" : "Back to the Decision Inbox"}
        </Link>
        <Card className="mx-auto w-full max-w-4xl p-6 sm:p-10">
          <DecisionPage decision={decision} locale={isHe ? "he" : "en"} />
        </Card>
      </div>
    </AppShell>
  );
}
