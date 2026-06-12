// Продажи и возвраты: statistics-api, инкрементально по lastChangeDate (flag=0).
import { wbFetch } from "@/lib/wb/client";
import { WB } from "@/lib/wb/endpoints";
import { db } from "@/lib/db";

type WbSale = {
  saleID: string; date: string; lastChangeDate: string; nmId: number;
  forPay: number; priceWithDisc: number; saleID_type?: string;
};

export async function collectSales(cabinetSid: string, token: string): Promise<number> {
  const lastRaw = await db.$queryRaw<{ max: Date | null }[]>`
    SELECT max(s."date") as max FROM "Sale" s WHERE s."cabinetSid" = ${cabinetSid}`;
  const dateFrom = lastRaw[0]?.max
    ? new Date(lastRaw[0].max.getTime() - 864e5).toISOString().slice(0, 10) // −1 день перекрытия
    : new Date(Date.now() - 89 * 864e5).toISOString().slice(0, 10);

  const rows = await wbFetch<WbSale[]>({
    cabinetToken: token, url: WB.sales, minIntervalMs: 60_000,
    params: { dateFrom, flag: "0" },
  });
  if (!rows?.length) return 0;

  let n = 0;
  for (const s of rows) {
    if (!s.saleID) continue;
    // S… продажа, R… возврат — тип по префиксу saleID
    const type = s.saleID.startsWith("R") ? "R" : s.saleID.startsWith("B") ? "B" : "S";
    await db.sale.upsert({
      where: { saleId: s.saleID },
      create: {
        saleId: s.saleID, date: new Date(s.date), nmId: BigInt(s.nmId), cabinetSid,
        forPay: s.forPay, priceWithDisc: s.priceWithDisc ?? null, type,
      },
      update: { forPay: s.forPay, priceWithDisc: s.priceWithDisc ?? null },
    });
    n++;
  }
  return n;
}
