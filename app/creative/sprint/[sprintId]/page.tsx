// Sprint detail page — server-rendered initial view, then a client
// component handles live polling + action buttons (generate, approve,
// publish, evaluate, cancel).
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";
import { getSprintDetail } from "@/lib/services/creative-sprint/sprint-service";
import { SprintDetailBoard } from "@/components/creative-sprint/sprint-detail-board";
import { AppError } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

export default async function SprintDetailPage({ params }: { params: Promise<{ sprintId: string }> }) {
  const { sprintId } = await params;
  const [chrome, locale] = await Promise.all([getAppChromeData(), getAppLocale()]);
  let detail;
  try {
    detail = await getSprintDetail(sprintId);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) notFound();
    throw err;
  }
  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <SprintDetailBoard
        initial={detail}
        locale={locale}
        storeName={chrome.store.name}
        storeCurrency={chrome.store.currency}
      />
    </AppShell>
  );
}
