// CRUD for WeeklyReportRecipient — the email addresses that receive the
// weekly + monthly auto-generated reports.

import { getDb } from "@/lib/server/db";

export interface WeeklyReportRecipientRow {
  id: string;
  email: string;
  displayName: string | null;
  active: boolean;
  createdAt: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && EMAIL_PATTERN.test(value.trim());
}

export async function listRecipients(storeId: string): Promise<WeeklyReportRecipientRow[]> {
  const db = getDb() as any;
  const rows = await db.weeklyReportRecipient.findMany({
    where: { storeId },
    orderBy: { createdAt: "asc" }
  });
  return rows.map((r: any) => ({
    id: r.id,
    email: r.email,
    displayName: r.displayName ?? null,
    active: r.active,
    createdAt: r.createdAt.toISOString()
  }));
}

export async function listActiveRecipientEmails(storeId: string): Promise<string[]> {
  const db = getDb() as any;
  const rows = await db.weeklyReportRecipient.findMany({
    where: { storeId, active: true },
    select: { email: true }
  });
  return rows.map((r: any) => r.email);
}

export async function addRecipient(
  storeId: string,
  email: string,
  displayName?: string | null
): Promise<WeeklyReportRecipientRow> {
  const db = getDb() as any;
  const cleaned = email.trim().toLowerCase();
  if (!isValidEmail(cleaned)) {
    throw new Error("Invalid email address.");
  }
  const row = await db.weeklyReportRecipient.upsert({
    where: { storeId_email: { storeId, email: cleaned } },
    update: { displayName: displayName?.trim() || null, active: true },
    create: { storeId, email: cleaned, displayName: displayName?.trim() || null }
  });
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName ?? null,
    active: row.active,
    createdAt: row.createdAt.toISOString()
  };
}

export async function setRecipientActive(
  storeId: string,
  id: string,
  active: boolean
): Promise<void> {
  const db = getDb() as any;
  await db.weeklyReportRecipient.updateMany({
    where: { id, storeId },
    data: { active }
  });
}

export async function removeRecipient(storeId: string, id: string): Promise<void> {
  const db = getDb() as any;
  await db.weeklyReportRecipient.deleteMany({
    where: { id, storeId }
  });
}
