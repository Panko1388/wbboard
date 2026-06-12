// Реклама: список кампаний (promotion/count) → fullstats v3 (≤50 кампаний, ≤31 дня).
import { wbFetch, wbPost } from "@/lib/wb/client";
import { WB } from "@/lib/wb/endpoints";
import { db } from "@/lib/db";

type CountResp = { adverts?: { type: number; advert_list?: { advertId: number }[] }[] };
type FullstatsRow = {
  advertId: number;
  days?: { date: string; sum: number; views: number; clicks: number; sum_price?: number;
    apps?: { nm?: { nmId: number; sum: number; views: number; clicks: number; sum_price?: number }[] }[] }[];
};

export async function collectAdv(cabinetSid: string, token: string): Promise<number> {
  const count = await wbFetch<CountResp>({ cabinetToken: token, url: WB.advCount, minIntervalMs: 12_000 });
  const ids = (count.adverts ?? []).flatMap(a => (a.advert_list ?? []).map(x => ({ id: x.advertId, type: a.type })));
  if (!ids.length) return 0;

  const d2 = new Date().toISOString().slice(0, 10);
  const d1 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  let n = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const body = chunk.map(c => ({ id: c.id, interval: { begin: d1, end: d2 } }));
    const stats = await wbPost<FullstatsRow[]>({ cabinetToken: token, url: WB.advFullstats, minIntervalMs: 60_000, body });

    for (const st of stats ?? []) {
      const campType = chunk.find(c => c.id === st.advertId)?.type;
      for (const day of st.days ?? []) {
        const date = new Date(day.date.slice(0, 10));
        const nms = (day.apps ?? []).flatMap(a => a.nm ?? []);
        if (nms.length) {
          for (const nm of nms) {
            await db.advDaily.upsert({
              where: { date_campaignId_nmId: { date, campaignId: BigInt(st.advertId), nmId: BigInt(nm.nmId) } },
              create: {
                date, campaignId: BigInt(st.advertId), nmId: BigInt(nm.nmId), cabinetSid,
                campaignType: campType === 8 ? "auto" : campType === 9 ? "search-catalog" : String(campType ?? ""),
                views: nm.views ?? 0, clicks: nm.clicks ?? 0, spend: nm.sum ?? 0, ordersRub: nm.sum_price ?? 0,
              },
              update: { views: nm.views ?? 0, clicks: nm.clicks ?? 0, spend: nm.sum ?? 0, ordersRub: nm.sum_price ?? 0 },
            });
            n++;
          }
        } else {
          await db.advDaily.upsert({
            where: { date_campaignId_nmId: { date, campaignId: BigInt(st.advertId), nmId: BigInt(0) } },
            create: {
              date, campaignId: BigInt(st.advertId), nmId: BigInt(0), cabinetSid,
              campaignType: String(campType ?? ""), views: day.views ?? 0, clicks: day.clicks ?? 0,
              spend: day.sum ?? 0, ordersRub: day.sum_price ?? 0,
            },
            update: { spend: day.sum ?? 0, views: day.views ?? 0, clicks: day.clicks ?? 0 },
          });
          n++;
        }
      }
    }
  }
  return n;
}
