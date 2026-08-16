import { withOptionalDb } from "@/lib/server/db";

export async function resolveOrCreateBaseStore() {
  return withOptionalDb(
    async (db) =>
      (await db.store.findFirst({
        where: { connected: true, connection: { isNot: null } },
        orderBy: { updatedAt: "desc" }
      })) ??
      (await db.store.findFirst({ orderBy: { updatedAt: "desc" } })),
    null
  );
}
