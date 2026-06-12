// Тарифы: комиссии по предметам + коробные тарифы складов (логистика/хранение).
import { wbFetch } from "@/lib/wb/client";
import { WB } from "@/lib/wb/endpoints";
import { db } from "@/lib/db";

type CommissionResp = { report: { parentName: string; subjectName: string; kgvpMarketplace: number; kgvpSupplier: number; paidStorageKgvp: number }[] };
type BoxResp = { response: { data: { warehouseList: {
  warehouseName: string; boxDeliveryAndStorageExpr: string;
  boxDeliveryBase: string; boxDeliveryLiter: string; boxStorageBase: string; boxStorageLiter: string;
}[] } } };

const num = (s: string | number | undefined) => Number(String(s ?? "0").replace(",", ".")) || 0;

export async function collectTariffs(_cabinetSid: string, token: string): Promise<number> {
  let n = 0;

  const com = await wbFetch<CommissionResp>({ cabinetToken: token, url: WB.commission, minIntervalMs: 1_000 });
  for (const c of com.report ?? []) {
    await db.commission.upsert({
      where: { subjectName: c.subjectName },
      create: {
        parentName: c.parentName, subjectName: c.subjectName,
        kgvpWb: c.paidStorageKgvp ?? 0, kgvpMp: c.kgvpMarketplace ?? 0, kgvpSupplier: c.kgvpSupplier ?? 0,
      },
      update: { kgvpWb: c.paidStorageKgvp ?? 0, kgvpMp: c.kgvpMarketplace ?? 0, kgvpSupplier: c.kgvpSupplier ?? 0, fetchedAt: new Date() },
    });
    n++;
  }

  const today = new Date().toISOString().slice(0, 10);
  const box = await wbFetch<BoxResp>({
    cabinetToken: token, url: WB.tariffsBox, minIntervalMs: 1_000, params: { date: today },
  });
  for (const w of box.response?.data?.warehouseList ?? []) {
    await db.tariffBox.upsert({
      where: { date_warehouse: { date: new Date(today), warehouse: w.warehouseName } },
      create: {
        date: new Date(today), warehouse: w.warehouseName,
        deliveryCoef: num(w.boxDeliveryAndStorageExpr) / 100 || 1,
        deliveryBase: num(w.boxDeliveryBase), deliveryLiter: num(w.boxDeliveryLiter),
        storageCoef: num(w.boxDeliveryAndStorageExpr) / 100 || 1,
        storageBase: num(w.boxStorageBase), storageLiter: num(w.boxStorageLiter),
      },
      update: { deliveryBase: num(w.boxDeliveryBase), deliveryLiter: num(w.boxDeliveryLiter) },
    });
    n++;
  }
  return n;
}
