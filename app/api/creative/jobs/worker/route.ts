import { NextResponse } from "next/server";
import { runOneJob } from "@/lib/server/creative-job-runner";

// Internal worker endpoint pinged by the in-process cron in
// `lib/server/creative-job-cron.ts`. Protected by CREATIVE_WORKER_SECRET when
// set — in production you should set it; in dev it's optional.
//
// One POST = one job. The cron keeps ticking and will pick up more work on
// subsequent beats.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  // SA-BUG-046: deny-by-default (AP-T32) — fail-closed when CREATIVE_WORKER_SECRET unset
  const expectedSecret = process.env.CREATIVE_WORKER_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const provided = request.headers.get("x-creative-worker-secret");
  if (provided !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await runOneJob();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
