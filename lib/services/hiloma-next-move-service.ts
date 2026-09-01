// Hiloma's "next move" — the single most valuable thing to do this week for
// the store, written by the same analyst the chat uses (same persona, same
// tools, same numbers), cached per store-day so the page never waits on the
// model. Read-only: Hiloma recommends; nothing here executes anything.
//
// Cache miss → the page shows "thinking" and kicks the generation in the
// background (fire-and-cache, like the competitor brief); the next load
// reads the answer.

import { getDb } from "@/lib/server/db";
import { formatDateInTimeZone, getStoreTimeZone } from "@/lib/server/reporting-date-range";
import { isDirectBiConfigured, runBiChatTurn } from "@/lib/services/bi-chat-service";

export interface HilomaNextMove {
  text: string;
  generatedAt: string;
  /** Store-TZ calendar day the answer describes. */
  day: string;
}

const KEY = (storeId: string, locale: string, day: string) => `hiloma_next_move:${storeId}:${locale}:${day}`;
const inFlight = new Set<string>();

const QUESTION: Record<"he" | "en", string> = {
  he:
    "מה המהלך הבא הכי חשוב לחנות השבוע? בדקי רווח ותרומה, קמפיינים, קודי הנחה, מלאי, מתחרים והתראות פתוחות — ובחרי מהלך אחד בלבד, זה עם ה-₪ הגדול ביותר מאחוריו. " +
    "ענה בפורמט הקבוע: שורה תחתונה, הנתונים, המהלך, לשים לב. תמציתי ומדויק.",
  en:
    "What is the single most important next move for the store this week? Check contribution profit, campaigns, discount codes, inventory, competitors and open alerts — and pick ONE move, the one with the most ₪ behind it. " +
    "Answer in the fixed format: bottom line, the numbers, the move, watch. Concise and exact."
};

export async function getHilomaNextMove(
  storeId: string,
  locale: "he" | "en"
): Promise<{ move: HilomaNextMove | null; pending: boolean; available: boolean }> {
  if (!isDirectBiConfigured()) return { move: null, pending: false, available: false };
  const db = getDb();
  const tz = await getStoreTimeZone(storeId).catch(() => "Asia/Jerusalem");
  const day = formatDateInTimeZone(new Date(), tz);
  const key = KEY(storeId, locale, day);

  const cached = (await db.systemConfig
    .findUnique({ where: { key }, select: { value: true } })
    .catch(() => null)) as { value: string } | null;
  if (cached) {
    try {
      return { move: JSON.parse(cached.value) as HilomaNextMove, pending: false, available: true };
    } catch {
      /* fall through to regenerate */
    }
  }

  if (!inFlight.has(key)) {
    inFlight.add(key);
    void runBiChatTurn({ storeId, locale, question: QUESTION[locale], section: "/growth-agent" })
      .then(async (text) => {
        if (!text?.trim()) return;
        const value = JSON.stringify({ text: text.trim(), generatedAt: new Date().toISOString(), day } satisfies HilomaNextMove);
        await db.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
      })
      .catch((error) => {
        console.warn("[hiloma-next-move] generation failed:", error instanceof Error ? error.message : error);
      })
      .finally(() => {
        inFlight.delete(key);
      });
  }
  return { move: null, pending: true, available: true };
}
