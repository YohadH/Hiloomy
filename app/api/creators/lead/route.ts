import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { sendTransactionalEmail } from "@/lib/email/email-client";
import { sendTelegramMessage } from "@/lib/server/telegram";

// Lead capture for the public /creators landing. Stores the request as a
// SystemConfig row (`creator_lead:<id>`, JSON) so nothing depends on a new
// table, then notifies the owner by email and Telegram, both best-effort.
// Public route — listed under PUBLIC_PREFIXES in middleware.

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
  if (tooMany(ip)) return NextResponse.json({ error: "יותר מדי נסיונות. נסו שוב בעוד כמה דקות." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "הטופס לא נשלח כמו שצריך." }, { status: 400 });
  // Honeypot filled → a bot. Answer OK so it learns nothing.
  if (clean(body.website, 10)) return NextResponse.json({ ok: true });

  const lead = {
    name: clean(body.name, 120),
    brand: clean(body.brand, 120),
    email: clean(body.email, 160).toLowerCase(),
    phone: clean(body.phone, 40),
    site: clean(body.site, 200),
    creators: clean(body.creators, 20),
    notes: clean(body.notes, 1500),
    source: "/creators",
    ip,
    createdAt: new Date().toISOString()
  };
  if (!lead.name || !lead.brand) return NextResponse.json({ error: "צריך שם ומותג." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return NextResponse.json({ error: "כתובת האימייל לא נראית תקינה." }, { status: 400 });
  if (!lead.creators) return NextResponse.json({ error: "ספרו לנו עם כמה יוצרים אתם עובדים." }, { status: 400 });

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await getDb().systemConfig.create({ data: { key: `creator_lead:${id}`, value: JSON.stringify(lead) } });
  } catch (err) {
    console.error("[creators/lead] store failed:", err);
    return NextResponse.json({ error: "לא הצלחנו לשמור את הפנייה. נסו שוב בעוד רגע." }, { status: 500 });
  }

  const lines = [
    `שם: ${lead.name}`,
    `מותג: ${lead.brand}`,
    `אימייל: ${lead.email}`,
    lead.phone ? `טלפון: ${lead.phone}` : null,
    lead.site ? `חנות: ${lead.site}` : null,
    `יוצרים: ${lead.creators}`,
    lead.notes ? `איך מתנהל היום: ${lead.notes}` : null
  ].filter(Boolean) as string[];

  await Promise.all([
    sendTelegramMessage(`*ליד חדש — Hiloomy Creator*\n${lines.join("\n")}`),
    sendTransactionalEmail({
      to: LEADS_TO,
      subject: `ליד חדש — Hiloomy Creator: ${lead.brand}`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7">${lines
        .map((l) => `<p style="margin:0 0 6px">${l.replace(/</g, "&lt;")}</p>`)
        .join("")}<p style="margin-top:14px;color:#666">מזהה: creator_lead:${id}</p></div>`,
      replyTo: lead.email
    })
  ]);

  return NextResponse.json({ ok: true });
}
