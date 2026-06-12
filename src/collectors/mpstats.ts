// Ежедневный сбор MPstats: отслеживаемые ниши (Target mp_categories),
// конкуренты (MpCompetitor) и ключевые фразы (MpKeyword).
import { db } from "@/lib/db";
import { fetchCategorySummary, fetchCompetitorDays, fetchKeywordInfo } from "@/lib/mpstats/client";

export async function collectMpstats(): Promise<number> {
  const today = new Date(new Date().toISOString().slice(0, 10));
  let n = 0;

  // ниши
  const target = await db.target.findUnique({ where: { key: "mp_categories" } });
  const paths: string[] = Array.isArray(target?.value) ? (target!.value as string[]) : [];
  for (const path of paths) {
    const s = await fetchCategorySummary(path);
    await db.mpCategorySnapshot.upsert({
      where: { path_date: { path, date: today } },
      create: {
        path, date: today, revenue30: s.revenue30, sales30: s.sales30, items: s.items,
        itemsWithSales: s.itemsWithSales, sellers: s.sellers, avgPrice: s.avgPrice, top10Share: s.top10Share,
      },
      update: { revenue30: s.revenue30, sales30: s.sales30, items: s.items, itemsWithSales: s.itemsWithSales },
    });
    n++;
  }

  // конкуренты — дотягиваем последние 7 дней
  const comps = await db.mpCompetitor.findMany({ where: { active: true } });
  for (const c of comps) {
    const days = await fetchCompetitorDays(Number(c.nmId), 7);
    for (const d of days) {
      await db.mpCompetitorDaily.upsert({
        where: { compId_date: { compId: c.id, date: new Date(d.date) } },
        create: {
          compId: c.id, date: new Date(d.date), price: d.price, sales: d.sales,
          revenue: d.revenue, balance: d.balance, rating: d.rating, comments: d.comments,
        },
        update: { price: d.price, sales: d.sales, revenue: d.revenue, balance: d.balance },
      });
      n++;
    }
  }

  // ключевые фразы
  const kws = await db.mpKeyword.findMany({ where: { active: true } });
  for (const k of kws) {
    const info = await fetchKeywordInfo(k.phrase);
    await db.mpKeywordDaily.upsert({
      where: { kwId_date: { kwId: k.id, date: today } },
      create: { kwId: k.id, date: today, frequency: info.frequency, results: info.results },
      update: { frequency: info.frequency, results: info.results },
    });
    n++;
  }
  return n;
}
