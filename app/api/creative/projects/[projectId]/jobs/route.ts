import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { listJobsForProject } from "@/lib/services/creative-job-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getDb } from "@/lib/server/db";
import { toErrorMessage } from "@/lib/server/errors";

// GET /api/creative/projects/[projectId]/jobs
// Returns the project's GenerationJob rows so the client can poll progress.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const { projectId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "No active store." }, { status: 400 });
    }
    // Verify the project belongs to this store before returning anything.
    const db = getDb();
    const project = await db.creativeProject.findFirst({
      where: { id: projectId, storeId },
      select: { id: true }
    });
    if (!project) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }
    const jobs = await listJobsForProject(projectId, storeId);
    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
