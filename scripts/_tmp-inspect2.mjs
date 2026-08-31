import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasources: { db: { url: process.env.PROD_DB_URL } } });

// Who is in the legacy org + the qa.shopify org?
for (const oid of ["org_legacy_default", "cmt07i2bo0003pc29f0ai3xp9"]) {
  const o = await prisma.organization.findUnique({
    where: { id: oid },
    select: { id: true, name: true, memberships: { select: { role: true, user: { select: { email: true, id: true } } } } }
  });
  console.log(`ORG ${o?.name} [${oid}]`);
  for (const m of o?.memberships ?? []) console.log(`   ${m.role}  ${m.user?.email} (${m.user?.id})`);
}

// Stale coupon apply links: which slugs do stored applyLinks use, per store?
console.log("\nCOUPON ASSIGNMENT applyLink slugs:");
const assigns = await prisma.affiliateCouponAssignment.findMany({
  select: { id: true, storeId: true, code: true, applyLink: true }
});
const byKey = {};
for (const a of assigns) {
  const mt = (a.applyLink ?? "").match(/\/r\/([^/]+)\//);
  const slug = mt ? mt[1] : (a.applyLink ? "<other>" : "<null>");
  const key = `${a.storeId} :: ${slug}`;
  byKey[key] = (byKey[key] ?? 0) + 1;
}
for (const [k, v] of Object.entries(byKey)) console.log(`   ${v}  ${k}`);
console.log("\nsample applyLinks:");
for (const a of assigns.slice(0, 6)) console.log(`   store=${a.storeId} code=${a.code} link=${a.applyLink}`);
await prisma.$disconnect();
