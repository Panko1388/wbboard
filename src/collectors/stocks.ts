// Остатки WB: снапшоты 2 р/день (истории WB не отдаёт — копим свою).
// Заодно обогащает каталог Product (vendorCode, subject, brand).
import { wbFetch } from "@/lib/wb/client";
import { WB } from "@/lib/wb/endpoints";
import { db } from "@/lib/db";

type WbStock = {
  nmId: number; warehouseName: string; quantity: number;
  inWayToClient: number; inWayFromClient: number;
  supplierArticle?: string; subject?: string; brand?: string; barcode?: string;
};

export async function collectStocks(cabinetSid: string, token: string): Promise<number> {
  const rows = await wbFetch<WbStock[]>({
    cabinetToken: token, url: WB.stocks, minIntervalMs: 60_000,
    params: { dateFrom: "2019-06-20" }, // полный снапшот
  });
  if (!rows?.length) return 0;

  const takenAt = new Date();
  let n = 0;
  for (const s of rows) {
    await db.stockSnapshot.create({
      data: {
        takenAt, nmId: BigInt(s.nmId), cabinetSid, warehouse: s.warehouseName,
        qty: s.quantity, inWayToClient: s.inWayToClient ?? 0, inWayFromClient: s.inWayFromClient ?? 0,
      },
    });
    await db.product.upsert({
      where: { nmId: BigInt(s.nmId) },
      create: {
        nmId: BigInt(s.nmId), cabinetSid, vendorCode: s.supplierArticle ?? String(s.nmId),
        title: s.subject ?? s.supplierArticle ?? String(s.nmId), subject: s.subject ?? null, brand: s.brand ?? null,
      },
      update: { subject: s.subject ?? undefined, brand: s.brand ?? undefined },
    });
    n++;
  }
  return n;
}
