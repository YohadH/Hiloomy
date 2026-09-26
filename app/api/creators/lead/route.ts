import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { sendTransactionalEmail } from "@/lib/email/email-client";
import { sendTelegramMessage } from "@/lib/server/telegram";

// Lead capture for the public /creators landing. Validation and copy ported
// from the Creators project (app/api/leads, landing-redesign); storage is the
// Lead table (2026-09-26 — before that a SystemConfig JSON row). Owner is
// notified by Telegram and email, both best-effort; LEADS_WEBHOOK_URL adds a
// JSON webhook (Slack / Make / Zapier style). Public route — middleware
// PUBLIC_PREFIXES has /api/creators/.

export const runtime = "nodejs";

const LEADS_TO = process.env.CREATOR_LEADS_TO_EMAIL?.trim() || "yoadhakimv@gmail.com";
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function tooMany(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > MAX_PER_WINDOW;
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (tooMany(ip)) return NextResponse.json({ error: "נשלחו יותר מדי פניות בזמן קצר. נסו שוב בעוד כמה דקות." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "לא הצלחנו לשלוח את הטופס. נסו שוב." }, { status: 400 });
  // Honeypot filled → a bot. Answer OK so it learns nothing.
  if (clean(body.website, 10)) return NextResponse.json({ ok: true });

  const lead = {
    name: clean(body.name, 120),
    brand: clean(body.brand, 120),
    email: clean(body.email, 160).toLowerCase() || null,
    phone: clean(body.phone, 40),
    site: clean(body.site, 200) || null,
    creators: clean(body.creators, 20),
    notes: clean(body.notes, 1500) || null,
    source: "/creators",
    ip
  };
  if (!lead.name || !lead.brand) return NextResponse.json({ error: "מלאו את השם המלא ואת שם המותג." }, { status: 400 });
  if (lead.phone.replace(/\D/g, "").length < 7) return NextResponse.json({ error: "הזינו מספר טלפון תקין כדי שנוכל לחזור אליכם." }, { status: 400 });
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return NextResponse.json({ error: "כתובת המייל לא נראית תקינה." }, { status: 400 });
  if (!lead.creators) return NextResponse.json({ error: "בחרו עם כמה משפיענים אתם עובדים." }, { status: 400 });

  let id: string;
  try {
    const row = await (getDb() as any).lead.create({ data: lead });
    id = row.id;
  } catch (err) {
    console.error("[creators/lead] store failed:", err);
    return NextResponse.json({ error: "לא הצלחנו לשמור את הפנייה. נסו שוב בעוד רגע." }, { status: 500 });
  }

  const lines = [
    `שם: ${lead.name}`,
    `מותג: ${lead.brand}`,
    `טלפון: ${lead.phone}`,
    lead.email ? `אימייל: ${lead.email}` : null,
    lead.site ? `חנות: ${lead.site}` : null,
    `משפיענים: ${lead.creators}`,
    lead.notes ? `הערות: ${lead.notes}` : null
  ].filter(Boolean) as string[];
  const text = `ליד חדש — Hiloomy Creator\n${lines.join("\n")}`;

  const webhook = process.env.LEADS_WEBHOOK_URL?.trim();
  await Promise.all([
    sendTelegramMessage(`*ליד חדש — Hiloomy Creator*\n${lines.join("\n")}`),
    sendTransactionalEmail({
      to: LEADS_TO,
      subject: `ליד חדש — Hiloomy Creator: ${lead.brand}`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7">${lines.map((l) => `<p style="margin:0 0 6px">${l.replace(/</g, "&lt;")}</p>`).join("")}<p style="margin-top:14px;color:#666">Lead ${id}</p></div>`,
      replyTo: lead.email ?? undefined
    }),
    webhook
      ? fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, lead: { id, ...lead } }) }).catch((err) => console.error("[creators/lead] webhook failed:", err))
      : Promise.resolve()
  ]);

  return NextResponse.json({ ok: true });
}
