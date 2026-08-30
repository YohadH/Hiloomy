// Get invited teammates onto the dashboard: delete each one's EMPTY personal
// org (auto-created at signup) so they default into the org they were invited
// to. Hard safety: only delete an org that has ZERO stores AND exactly ONE
// member (the owner themselves) AND the user has another membership to fall
// back to.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasources: { db: { url: process.env.PROD_DB_URL } } });

const TARGET_EMAILS = ["yoadhakimg@gmail.com", "nirbentzy@gmail.com"];

for (const email of TARGET_EMAILS) {
  const user = await prisma.user.findFirst({
    where: { email },
    select: {
      id: true, email: true,
      memberships: {
        select: {
          role: true,
          org: { select: { id: true, name: true, _count: { select: { stores: true, memberships: true } } } }
        }
      }
    }
  });
  if (!user) { console.log(`- ${email}: no user row, skip`); continue; }

  const orgsWithStores = user.memberships.filter((m) => m.org._count.stores > 0);
  const emptyOwnedSolo = user.memberships.filter(
    (m) => m.role === "owner" && m.org._count.stores === 0 && m.org._count.memberships === 1
  );

  console.log(`\n${email}:`);
  for (const m of user.memberships) {
    console.log(`   membership role=${m.role} org="${m.org.name}" stores=${m.org._count.stores} members=${m.org._count.memberships}`);
  }

  if (orgsWithStores.length === 0) {
    console.log(`   !! no org-with-stores to fall back to — SKIP (won't strand the user)`);
    continue;
  }
  for (const m of emptyOwnedSolo) {
    await prisma.organization.delete({ where: { id: m.org.id } });
    console.log(`   ✓ deleted empty personal org "${m.org.name}" (${m.org.id})`);
  }
  if (emptyOwnedSolo.length === 0) console.log(`   (nothing to delete)`);
}

// Verify final state
console.log("\n--- FINAL ---");
for (const email of TARGET_EMAILS) {
  const u = await prisma.user.findFirst({
    where: { email },
    select: { email: true, memberships: { select: { role: true, org: { select: { name: true, _count: { select: { stores: true } } } } } } }
  });
  if (!u) continue;
  console.log(`${email}: ` + u.memberships.map((m) => `${m.org.name}[stores=${m.org._count.stores},${m.role}]`).join(", "));
}
await prisma.$disconnect();
