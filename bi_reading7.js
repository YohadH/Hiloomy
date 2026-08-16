const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7*24*60*60*1000);
  const d14 = new Date(now.getTime() - 14*24*60*60*1000);

  const [orders7, ordersPrior, refunds7, refundsPrior, alertsOpen, lastSync] = await Promise.all([
    prisma.order.aggregate({ where: { createdAt: { gte: d7 } }, _count: true, _sum: { totalPrice: true }, _avg: { totalPrice: true } }),
    prisma.order.aggregate({ where: { createdAt: { gte: d14, lt: d7 } }, _count: true, _sum: { totalPrice: true } }),
    prisma.refund.aggregate({ where: { createdAt: { gte: d7 } }, _count: true, _sum: { refundedAmount: true } }),
    prisma.refund.aggregate({ where: { createdAt: { gte: d14, lt: d7 } }, _count: true, _sum: { refundedAmount: true } }),
    prisma.alert.findMany({ where: { resolvedAt: null }, select: { source: true, severity: true, title: true, description: true, createdAt: true, status: true } }),
    prisma.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 5, select: { startedAt: true, status: true, mode: true, detailsJson: true, recordsCreated: true, recordsUpdated: true } }),
  ]);

  const allTime = await prisma.order.count();
  // New customers: first order falls within window (customer created within window AND not returning)
  const newCust7 = await prisma.customer.count({ where: { createdAt: { gte: d7 }, isReturning: false } });
  const newCustPrior = await prisma.customer.count({ where: { createdAt: { gte: d14, lt: d7 }, isReturning: false } });

  // Meta Ads
  const d7str = d7.toISOString().split('T')[0];
  const d14str = d14.toISOString().split('T')[0];
  const nowStr = now.toISOString().split('T')[0];

  const metaRows = await prisma.metaAdsCampaignInsight.findMany({
    where: { dateStart: { gte: d7 } },
    select: { dateStart: true, spend: true, impressions: true, clicks: true, purchases: true, purchaseRoas: true }
  });
  const metaPrior = await prisma.metaAdsCampaignInsight.findMany({
    where: { dateStart: { gte: d14, lt: d7 } },
    select: { spend: true, impressions: true, clicks: true, purchases: true }
  });

  const lastMetaDate = metaRows.length ? metaRows.reduce((a,b) => a.dateStart > b.dateStart ? a : b).dateStart : 'none';
  const sum7 = metaRows.reduce((a,r) => ({ spend: a.spend+(Number(r.spend)||0), impr: a.impr+(r.impressions||0), clicks: a.clicks+(r.clicks||0), purchases: a.purchases+(r.purchases||0) }), {spend:0,impr:0,clicks:0,purchases:0});
  const sumPrior = metaPrior.reduce((a,r) => ({ spend: a.spend+(Number(r.spend)||0), impr: a.impr+(r.impressions||0), clicks: a.clicks+(r.clicks||0), purchases: a.purchases+(r.purchases||0) }), {spend:0,impr:0,clicks:0,purchases:0});

  console.log(JSON.stringify({
    queryTime: now.toISOString(),
    windows: { last7d_from: d7.toISOString(), prior7d_from: d14.toISOString(), prior7d_to: d7.toISOString() },
    orders7, ordersPrior, newCust7, newCustPrior,
    refunds7, refundsPrior,
    alertsOpen,
    lastSync,
    allTime,
    meta: { lastDate: lastMetaDate, sum7, sumPrior }
  }, null, 2));
}

main()
  .catch(e => { console.error('ERROR:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
