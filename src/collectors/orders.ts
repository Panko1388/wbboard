// Заказы: statistics-api, инкрементально по lastChangeDate (flag=0).
// История 90 дней — при первом запуске backfill с (сегодня − 89 дней).
import { wbFetch } from "@/lib/wb/client";
import { WB } from "@/lib/wb/endpoints";
import { db } from "@/lib/db";

type WbOrder = {
  srid: string; date: string; lastChangeDate: string; nmId: number;
  totalPrice: number; priceWithDisc: number; spp?: number;
  warehouseName?: string; regionName?: string; oblastOkrugName?: string;
  isCancel: boolean; supplierArticle?: string; subject?: string; brand?: string;
};

export async function collectOrders(cabinetSid: string, token: string): Promise<number> {
  const last = await db.order.findFirst({ where: { cabinetSid }, orderBy: { lastChangeDate: "desc" } });
  // dateFrom БЕЗ суффикса Z: WB ждёт МСК-стенку; "…Z" сдвинул бы окно на 3 ч и
  // создал молчаливые пропуски изменённых заказов (аудит #10)
  const dateFrom = last
    ? last.lastChangeDate.toISOString().slice(0, 19)
    : new Date(Date.now() - 89 * 864e5).toISOString().slice(0, 10);

  const rows = await wbFetch<WbOrder[]>({
    cabinetToken: token, url: WB.orders, minIntervalMs: 60_000,
    params: { dateFrom, flag: "0" },
  });
  if (!rows?.length) return 0;

  await db.rawApiResponse.create({
    data: { collector: `orders:${cabinetSid}`, payload: rows.slice(0, 50) as object[] },
  });

  let n = 0;
  for (const o of rows) {
    if (!o.srid) continue;
    await db.order.upsert({
      where: { id: o.srid },
      create: {
        id: o.srid, date: new Date(o.date), lastChangeDate: new Date(o.lastChangeDate),
        nmId: BigInt(o.nmId), cabinetSid, totalPrice: o.totalPrice, priceWithDisc: o.priceWithDisc,
        spp: o.spp ?? null, warehouse: o.warehouseName ?? null,
        region: o.oblastOkrugName ?? o.regionName ?? null, isCancel: o.isCancel,
      },
      update: { lastChangeDate: new Date(o.lastChangeDate), isCancel: o.isCancel, priceWithDisc: o.priceWithDisc },
    });
    // карточка товара появляется из заказов, если ещё не знаем её
    await db.product.upsert({
      where: { nmId: BigInt(o.nmId) },
      create: {
        nmId: BigInt(o.nmId), cabinetSid, vendorCode: o.supplierArticle ?? String(o.nmId),
        title: o.subject ?? o.supplierArticle ?? String(o.nmId), subject: o.subject ?? null, brand: o.brand ?? null,
      },
      update: {},
    });
    n++;
  }
  return n;
}
