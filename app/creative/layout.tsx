// Layout for all /creative* pages — mounts the Creative agent panel so it
// appears ONLY in the creative studio (owner call, 2026-08-26: studio pages
// only; the global floating widget stays BI+support).

import { getAppLocale } from "@/lib/i18n";
import { CreativeAgentPanel } from "@/components/creative/creative-agent-panel";

export default async function CreativeLayout({ children }: { children: React.ReactNode }) {
  const locale = await getAppLocale();
  return (
    <>
      {children}
      <CreativeAgentPanel locale={locale === "he" ? "he" : "en"} />
    </>
  );
}
