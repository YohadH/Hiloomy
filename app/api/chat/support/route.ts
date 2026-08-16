import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { toErrorMessage } from "@/lib/server/errors";

// POST /api/chat/support — customer-support message from the floating chat
// widget. Stored in the SupportMessage inbox; best-effort email notification
// to SUPPORT_EMAIL when Resend is configured. Replies happen over email.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { message?: string };
    const message = (body.message ?? "").trim().slice(0, 4000);
    if (!message) {
      return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });
    }

    const storeId = await resolveActiveStoreId().catch(() => null);
    const db = getDb() as any;
    await db.supportMessage.create({
      data: {
        storeId,
        userId: auth.userId,
        email: auth.email,
        message
      }
    });

    // Best-effort email notification — never blocks or fails the request.
    const supportTo = process.env.SUPPORT_EMAIL?.trim();
    if (supportTo && process.env.RESEND_API_KEY) {
      void import("@/lib/email/email-client")
        .then(({ sendTransactionalEmail }) =>
          sendTransactionalEmail({
            to: supportTo,
            subject: `פניית שירות חדשה מ${auth.email ?? "משתמש"}`,
            html: `<p>${message.replace(/</g, "&lt;")}</p><p>מאת: ${auth.email ?? auth.userId}</p>`
          })
        )
        .catch((err) => console.warn("[support-chat] email notify failed:", err));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
