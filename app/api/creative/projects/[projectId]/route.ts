import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { deleteProject, getProjectDetail } from "@/lib/services/creative-project-service";
import { toErrorMessage } from "@/lib/server/errors";

// GET /api/creative/projects/[projectId]
// Returns the full project detail (sources + assets) so the client can poll
// for updates while a batch job is running.
//
// DELETE /api/creative/projects/[projectId]
// Hard-deletes the project + cascades to sources + assets, then best-effort
// cleans up storage objects in R2/local.
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
    const project = await getProjectDetail(storeId, projectId);
    if (!project) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
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
    await deleteProject(storeId, projectId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = toErrorMessage(error);
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
