// Воронка карточек (nm-report v2): открытия → корзина → заказы → выкупы, по дням.
import { wbPost } from "@/lib/wb/client";
import { WB } from "@/lib/wb/endpoints";
import { db } from "@/lib/db";

type NmReportResp = {
  data?: { cards?: { nmID: number; statistics?: { selectedPeriod?: {
    openCardCount?: number; addToCartCount?: number; ordersCount?: number; buyoutsCount?: number;
  } } }[]; isNextPage?: boolean };
};

export async function collectFunnel(cabinetSid: string, token: string): Promise<number> {
  // за вчера, по всем карточкам с пагинацией
  const day = new Date(Date.now() - 864e5);
  const dayStr = day.toISOString().slice(0, 10);
  let page = 1;
  let n = 0;

  for (let i = 0; i < 50; i++) {
    const resp = await wbPost<NmReportResp>({
      cabinetToken: token, url: WB.nmReport, minIntervalMs: 21_000, // 3 р/мин
      body: { period: { begin: `${dayStr} 00:00:00`, end: `${dayStr} 23:59:59` }, page },
    });
    const cards = resp.data?.cards ?? [];
    for (const c of cards) {
      const s = c.statistics?.selectedPeriod;
      if (!s) continue;
      await db.funnelDaily.upsert({
        where: { date_nmId: { date: new Date(dayStr), nmId: BigInt(c.nmID) } },
        create: {
          date: new Date(dayStr), nmId: BigInt(c.nmID),
          openCard: s.openCardCount ?? 0, addToCart: s.addToCartCount ?? 0,
          orders: s.ordersCount ?? 0, buyouts: s.buyoutsCount ?? 0,
        },
        update: {
          openCard: s.openCardCount ?? 0, addToCart: s.addToCartCount ?? 0,
          orders: s.ordersCount ?? 0, buyouts: s.buyoutsCount ?? 0,
        },
      });
      n++;
    }
    if (!resp.data?.isNextPage) break;
    page++;
  }
  return n;
}
