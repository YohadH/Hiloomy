import { NextResponse } from "next/server";

// Public status URL referenced by the confirmation code returned from
// /api/meta/data-deletion. Facebook expects a URL where users can check
// the status of their deletion request. We show a minimal page confirming
// the deletion was queued; for an analytics SaaS the actual deletion is
// effectively immediate (we don't store FB user profiles), so this is
// mostly cosmetic.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Deletion status</title></head>
<body style="font-family: system-ui; max-width: 640px; margin: 40px auto; padding: 0 16px; color: #1e293b;">
<h1 style="font-size: 24px;">Deletion request status</h1>
<p>Confirmation code: <code style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">${code.replace(/[^a-zA-Z0-9-]/g, "")}</code></p>
<p><strong>Status:</strong> Completed.</p>
<p>Any Meta-linked data we held has been removed from our active database. Backup snapshots are purged within 30 days.</p>
<p>Questions: <a href="mailto:yohad@brandzp.co.il">yohad@brandzp.co.il</a></p>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
