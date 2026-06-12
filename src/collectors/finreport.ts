// Финотчёт v5 (еженедельный, «истина» для сверки). Пагинация по rrdid.
// Backfill: при первом запуске тянем с 2024-01-29 окнами по неделе.
import { wbFetch } from "@/lib/wb/client";
import { WB } from "@/lib/wb/endpoints";
import { db } from "@/lib/db";

type FinRow = {
  rrd_id: number; realizationreport_id: number; rr_dt: string; nm_id?: number;
  doc_type_name?: string; supplier_oper_name?: string;
  retail_amount?: number; ppvz_for_pay?: number; delivery_rub?: number;
  storage_fee?: number; acceptance?: number; penalty?: number; deduction?: number;
  acquiring_fee?: number; ppvz_vw?: number;
};

const WINDOW_DAYS = 60; // окна бэкфилла: rrd_id не строго растёт по датам на больших периодах (research §4)
const PAGE_LIMIT = 30_000; // вместо 100k — бережём память воркера на 4 ГБ VPS (риск-аудит #8)
// Потолок страниц за ОДИН запуск: иначе долгий бэкфилл с 2024 держит очередь статистики
// часами и откладывает orders/sales (риск-аудит CRITICAL). Прогресс сохраняется в БД
// (строки upsert'ятся по ходу), следующий запуск продолжит с last.rrDt − 7д.
const MAX_PAGES_PER_RUN = 20;

export async function collectFinreport(cabinetSid: string, token: string): Promise<number> {
  const last = await db.finreportRow.findFirst({ where: { cabinetSid }, orderBy: { rrDt: "desc" } });
  const startFrom = last
    ? new Date(last.rrDt.getTime() - 7 * 864e5)
    : new Date("2024-01-29");
  const now = new Date();

  let total = 0;
  let pagesThisRun = 0;
  // окнами по 60 дней, в каждом — своя пагинация по rrdid
  for (let winStart = startFrom; winStart < now; winStart = new Date(winStart.getTime() + WINDOW_DAYS * 864e5)) {
    if (pagesThisRun >= MAX_PAGES_PER_RUN) break; // добьём в следующий запуск
    const winEnd = new Date(Math.min(winStart.getTime() + WINDOW_DAYS * 864e5, now.getTime()));
    const dateFrom = winStart.toISOString().slice(0, 10);
    const dateTo = winEnd.toISOString().slice(0, 10);

    let rrdid = 0;
    for (let page = 0; page < 100 && pagesThisRun < MAX_PAGES_PER_RUN; page++, pagesThisRun++) {
      const rows = await wbFetch<FinRow[]>({
        cabinetToken: token, url: WB.finreport, minIntervalMs: 60_000,
        params: { dateFrom, dateTo, rrdid: String(rrdid), limit: String(PAGE_LIMIT) },
      });
      if (!rows?.length) break;

      for (const r of rows) {
        await db.finreportRow.upsert({
          where: { rrdId: BigInt(r.rrd_id) },
          create: {
            rrdId: BigInt(r.rrd_id), realizationreportId: BigInt(r.realizationreport_id),
            rrDt: new Date(r.rr_dt), nmId: r.nm_id ? BigInt(r.nm_id) : null, cabinetSid,
            docType: r.doc_type_name ?? null, supplierOperName: r.supplier_oper_name ?? null,
            retailAmount: r.retail_amount ?? 0, ppvzForPay: r.ppvz_for_pay ?? 0,
            deliveryRub: r.delivery_rub ?? 0, storageFee: r.storage_fee ?? 0,
            acceptance: r.acceptance ?? 0, penalty: r.penalty ?? 0, deduction: r.deduction ?? 0,
            acquiringFee: r.acquiring_fee ?? 0, ppvzVw: r.ppvz_vw ?? 0,
            raw: r as object,
          },
          update: {},
        });
        total++;
      }
      rrdid = rows[rows.length - 1].rrd_id;
      if (rows.length < PAGE_LIMIT) break;
    }
  }
  return total;
}
