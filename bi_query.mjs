import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
try {
  const lastSync = await p.syncRun.findFirst({ orderBy: { startedAt: 'desc' } });
  console.log('LAST_SYNC:', lastSync?.startedAt, lastSync?.status, lastSync?.mode);

  const jun9 = await p.syncRun.count({ where: { startedAt: { gte: new Date('2026-06-09T00:00:00Z') } } });
  console.log('JUN9_SYNCS:', jun9);

  const last7 = await p.order.aggregate({ _count: true, _sum: { totalPrice: true }, where: { createdAt: { gte: new Date('2026-06-02T00:00:00Z') } } });
  const prior7 = await p.order.aggregate({ _count: true, _sum: { totalPrice: true }, where: { createdAt: { gte: new Date('2026-05-26T00:00:00Z'), lt: new Date('2026-06-02T00:00:00Z') } } });
  const refunds7 = await p.refund.aggregate({ _count: true, _sum: { refundedAmount: true }, where: { createdAt: { gte: new Date('2026-06-02T00:00:00Z') } } });
  const alerts = await p.alert.findMany({ where: { resolvedAt: null }, select: { type: true, severity: true, title: true, createdAt: true } });
  const allTime = await p.order.aggregate({ _count: true, _sum: { totalPrice: true } });
  const mostRecentOrder = await p.order.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true, totalPrice: true } });

  console.log('LAST7D:', JSON.stringify(last7));
  console.log('PRIOR7D:', JSON.stringify(prior7));
  console.log('REFUNDS7D:', JSON.stringify(refunds7));
  console.log('ALERTS:', JSON.stringify(alerts));
  console.log('ALLTIME:', JSON.stringify(allTime));
  console.log('MOST_RECENT_ORDER:', JSON.stringify(mostRecentOrder));

  const aov7 = last7._count ? (Number(last7._sum.totalPrice) / last7._count).toFixed(2) : 'N/A';
  console.log('AOV_LAST7D:', aov7);
} catch (e) {
  console.error('ERR:', e.message);
}
await p.$disconnect();
