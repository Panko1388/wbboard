// Запросы для дашбордов. Live-оценка прибыли (до прихода финотчёта):
//   forPay(продажи − возвраты) − логистика(оценка/факт) − хранение − COGS активной партии
//   − реклама − налог (УСН 2% + НДС 7/107) − аллоцированные косвенные.
// Факт из финотчёта перекрывает оценку на странице P&L (drift% — на дашборде).
import { cache } from "react";
import { db } from "@/lib/db";

export type Period = { from: Date; to: Date };

export function periodDays(p: Period): number {
  return Math.max(1, Math.round((p.to.getTime() - p.from.getTime()) / 864e5));
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

/** Скоуп кабинетов: список пользователя или ВСЕ АКТИВНЫЕ (демо/выключенные не подмешиваются — аудит #8) */
export const scopedCabinets = cache(async (userCabinets: string[]): Promise<string[]> => {
  if (userCabinets.length) return userCabinets;
  const cabs = await db.cabinet.findMany({ where: { active: true }, select: { sid: true } });
  return cabs.map(c => c.sid);
});

/** COGS за период: партия, активная на ДЕНЬ продажи; один запрос партий + один продаж (без N+1, аудит #15).
 *  Возвраты уменьшают нетто-штуки дня (товар вернулся на склад). */
export const cogsForPeriod = cache(async (p: Period, cabinets: string[]): Promise<{ total: number; byNm: Map<string, { units: number; cogs: number }> }> => {
  const byNm = new Map<string, { units: number; cogs: number }>();
  if (!cabinets.length) return { total: 0, byNm };

  const rows = await db.$queryRaw<{ nmid: bigint; d: Date; net: number }[]>`
    SELECT s."nmId" nmid, date_trunc('day', s."date") d,
           SUM(CASE WHEN s."type" = 'S' THEN 1 WHEN s."type" = 'R' THEN -1 ELSE 0 END)::int net
    FROM "Sale" s
    WHERE s."date" >= ${p.from} AND s."date" < ${p.to} AND s."cabinetSid" = ANY(${cabinets})
    GROUP BY 1, 2`;
  if (!rows.length) return { total: 0, byNm };

  const nmIds = [...new Set(rows.map(r => r.nmid))];
  const batches = await db.cogsBatch.findMany({
    where: { nmId: { in: nmIds } },
    orderBy: { validFrom: "asc" },
    select: { nmId: true, priceCur: true, rateAtPurchase: true, deliveryPerUnit: true, validFrom: true },
  });
  const batchesByNm = new Map<string, typeof batches>();
  for (const b of batches) {
    const k = b.nmId.toString();
    if (!batchesByNm.has(k)) batchesByNm.set(k, []);
    batchesByNm.get(k)!.push(b);
  }

  let total = 0;
  for (const r of rows) {
    if (r.net <= 0) continue;
    const k = r.nmid.toString();
    const list = batchesByNm.get(k);
    if (!list?.length) continue;
    let unit = 0;
    for (const b of list) {
      if (b.validFrom <= r.d) unit = num(b.priceCur) * num(b.rateAtPurchase) + num(b.deliveryPerUnit);
      else break;
    }
    if (!unit) { // продажа раньше первой партии — берём первую (стартовые остатки)
      const f = list[0];
      unit = num(f.priceCur) * num(f.rateAtPurchase) + num(f.deliveryPerUnit);
    }
    const cur = byNm.get(k) ?? { units: 0, cogs: 0 };
    cur.units += r.net;
    cur.cogs += r.net * unit;
    byNm.set(k, cur);
    total += r.net * unit;
  }
  return { total, byNm };
});

export type PulseTotals = {
  ordersSum: number; ordersCount: number; buyoutsSum: number; buyoutsCount: number;
  returnsSum: number; advSpend: number; cogs: number; logistics: number; storage: number;
  tax: number; profit: number; marg: number; drr: number;
};

/** Сводка за период по кабинетам (пусто = все активные) */
export async function pulseTotals(p: Period, userCabinets: string[]): Promise<PulseTotals> {
  const cabinets = await scopedCabinets(userCabinets);
  const cabWhere = { cabinetSid: { in: cabinets } };

  const [orders, sales, returns, adv] = await Promise.all([
    db.order.aggregate({
      where: { ...cabWhere, date: { gte: p.from, lt: p.to }, isCancel: false },
      _sum: { priceWithDisc: true }, _count: true,
    }),
    db.sale.aggregate({
      where: { ...cabWhere, date: { gte: p.from, lt: p.to }, type: "S" },
      _sum: { forPay: true }, _count: true,
    }),
    db.sale.aggregate({
      where: { ...cabWhere, date: { gte: p.from, lt: p.to }, type: "R" },
      _sum: { forPay: true }, _count: true,
    }),
    db.advDaily.aggregate({
      where: { ...cabWhere, date: { gte: p.from, lt: p.to } },
      _sum: { spend: true },
    }),
  ]);

  const buyoutsSum = num(sales._sum.forPay) - num(returns._sum.forPay);
  const buyoutsCount = sales._count - returns._count;

  // COGS по дате продажи (партия активная на день, без N+1 — аудит #12/#15)
  const { total: cogs } = await cogsForPeriod(p, cabinets);

  // Логистика/хранение: БЛЕНД (аудит #14) — факт финотчёта по закрытым неделям
  // + оценка по выкупам «хвоста», который финотчёт ещё не покрыл
  const fin = await db.finreportRow.aggregate({
    where: { ...cabWhere, rrDt: { gte: p.from, lt: p.to } },
    _sum: { deliveryRub: true, storageFee: true },
    _max: { rrDt: true },
  });
  const coveredEnd = fin._max.rrDt ? new Date(fin._max.rrDt.getTime() + 864e5) : p.from;
  const tail = await db.sale.groupBy({
    by: ["type"],
    where: { ...cabWhere, date: { gte: coveredEnd > p.from ? coveredEnd : p.from, lt: p.to } },
    _count: true,
  });
  const tailBuyouts = Math.max(0,
    (tail.find(t => t.type === "S")?._count ?? 0) - (tail.find(t => t.type === "R")?._count ?? 0));
  const logistics = num(fin._sum.deliveryRub) + tailBuyouts * Number(process.env.EST_LOGISTICS_RUB ?? 55);
  const storage = num(fin._sum.storageFee) + tailBuyouts * Number(process.env.EST_STORAGE_RUB ?? 6);

  // Налог УСН «Доходы» 2% + НДС 7/107 без вычетов — от ФАКТИЧЕСКОЙ розницы продаж
  // (priceWithDisc из API; для старых строк без неё — оценка forPay/0.75) — аудит #13
  const retailRows = await db.$queryRaw<{ retail: number }[]>`
    SELECT COALESCE(SUM(
      CASE WHEN s."type" = 'S' THEN COALESCE(s."priceWithDisc", s."forPay" / 0.75)
           WHEN s."type" = 'R' THEN -COALESCE(s."priceWithDisc", s."forPay" / 0.75)
           ELSE 0 END), 0)::float retail
    FROM "Sale" s
    WHERE s."date" >= ${p.from} AND s."date" < ${p.to} AND s."cabinetSid" = ANY(${cabinets})`;
  const retail = Math.max(0, retailRows[0]?.retail ?? 0);
  const vat = (retail * 0.07) / 1.07;
  const tax = Math.max(0, vat + 0.02 * (retail - vat));

  const advSpend = num(adv._sum.spend);
  const profit = buyoutsSum - cogs - logistics - storage - advSpend - tax;
  const ordersSum = num(orders._sum.priceWithDisc);

  return {
    ordersSum, ordersCount: orders._count,
    buyoutsSum, buyoutsCount,
    returnsSum: num(returns._sum.forPay),
    advSpend, cogs, logistics, storage, tax,
    profit,
    marg: buyoutsSum ? profit / buyoutsSum : 0,
    drr: ordersSum ? advSpend / ordersSum : 0,
  };
}

export type DayRow = {
  date: string; ordersSum: number; ordersCount: number; buyoutsSum: number;
  buyoutsCount: number; advSpend: number; drr: number;
};

/** РНП: ряды по дням */
export async function rnpByDay(p: Period, userCabinets: string[]): Promise<DayRow[]> {
  const cabinets = await scopedCabinets(userCabinets);
  const cab = `AND o."cabinetSid" = ANY($3)`;
  const params: unknown[] = [p.from, p.to, cabinets];

  const orders = await db.$queryRawUnsafe<{ d: Date; sum: number; cnt: bigint }[]>(
    `SELECT date_trunc('day', o."date") d, COALESCE(SUM(o."priceWithDisc"),0)::float sum, COUNT(*) cnt
     FROM "Order" o WHERE o."date" >= $1 AND o."date" < $2 AND o."isCancel" = false ${cab}
     GROUP BY 1 ORDER BY 1`, ...params);
  const sales = await db.$queryRawUnsafe<{ d: Date; sum: number; cnt: bigint }[]>(
    `SELECT date_trunc('day', s."date") d,
       COALESCE(SUM(CASE WHEN s."type"='S' THEN s."forPay" ELSE -s."forPay" END),0)::float sum,
       SUM(CASE WHEN s."type"='S' THEN 1 ELSE -1 END) cnt
     FROM "Sale" s WHERE s."date" >= $1 AND s."date" < $2 ${cab.replace(/o\./g, 's.')}
     GROUP BY 1 ORDER BY 1`, ...params);
  const adv = await db.$queryRawUnsafe<{ d: Date; sum: number }[]>(
    `SELECT a."date" d, COALESCE(SUM(a."spend"),0)::float sum
     FROM "AdvDaily" a WHERE a."date" >= $1 AND a."date" < $2 ${cab.replace(/o\./g, 'a.')}
     GROUP BY 1 ORDER BY 1`, ...params);

  const map = new Map<string, DayRow>();
  for (let t = p.from.getTime(); t < p.to.getTime(); t += 864e5) {
    const key = new Date(t).toISOString().slice(0, 10);
    map.set(key, { date: key, ordersSum: 0, ordersCount: 0, buyoutsSum: 0, buyoutsCount: 0, advSpend: 0, drr: 0 });
  }
  for (const r of orders) {
    const k = r.d.toISOString().slice(0, 10);
    const row = map.get(k); if (row) { row.ordersSum = r.sum; row.ordersCount = Number(r.cnt); }
  }
  for (const r of sales) {
    const k = r.d.toISOString().slice(0, 10);
    const row = map.get(k); if (row) { row.buyoutsSum = r.sum; row.buyoutsCount = Number(r.cnt); }
  }
  for (const r of adv) {
    const k = r.d.toISOString().slice(0, 10);
    const row = map.get(k); if (row) row.advSpend = r.sum;
  }
  for (const row of map.values()) row.drr = row.ordersSum ? row.advSpend / row.ordersSum : 0;
  return [...map.values()];
}

export type SkuRow = {
  nmId: number; vendorCode: string; title: string; photoUrl: string | null;
  ordersCount: number; ordersSum: number; buyoutsCount: number; buyoutsSum: number;
  advSpend: number; cogs: number; profit: number; marg: number; drr: number; stock: number; stockDays: number | null;
};

/** Таблица по SKU за период + остатки и обеспеченность */
export async function skuTable(p: Period, userCabinets: string[]): Promise<SkuRow[]> {
  const cabinets = await scopedCabinets(userCabinets);
  const cabWhere = { cabinetSid: { in: cabinets } };
  const products = await db.product.findMany({ where: cabWhere });
  const days = periodDays(p);

  const [ordersG, salesG, advG] = await Promise.all([
    db.order.groupBy({
      by: ["nmId"], where: { ...cabWhere, date: { gte: p.from, lt: p.to }, isCancel: false },
      _sum: { priceWithDisc: true }, _count: true,
    }),
    db.sale.groupBy({
      by: ["nmId", "type"], where: { ...cabWhere, date: { gte: p.from, lt: p.to } },
      _sum: { forPay: true }, _count: true,
    }),
    db.advDaily.groupBy({
      by: ["nmId"], where: { ...cabWhere, date: { gte: p.from, lt: p.to } },
      _sum: { spend: true },
    }),
  ]);

  // последний снапшот остатков ПО КАЖДОМУ кабинету (у каждого свой takenAt — аудит #6)
  const lastPerCab = await db.stockSnapshot.groupBy({
    by: ["cabinetSid"], where: cabWhere, _max: { takenAt: true },
  });
  const stocks = lastPerCab.length
    ? await db.stockSnapshot.groupBy({
        by: ["nmId"],
        where: { OR: lastPerCab.map(c => ({ cabinetSid: c.cabinetSid, takenAt: c._max.takenAt! })) },
        _sum: { qty: true },
      })
    : [];

  // COGS по партиям одним проходом (без N+1 — аудит #15)
  const { byNm: cogsByNm } = await cogsForPeriod(p, cabinets);

  // Map по nmId вместо .find() в цикле — было O(P²) на каждый рендер (риск-аудит)
  const ordersM = new Map(ordersG.map(x => [x.nmId, x]));
  const salesSM = new Map(salesG.filter(x => x.type === "S").map(x => [x.nmId, x]));
  const salesRM = new Map(salesG.filter(x => x.type === "R").map(x => [x.nmId, x]));
  const advM = new Map(advG.map(x => [x.nmId, x]));
  const stocksM = new Map(stocks.map(x => [x.nmId, x]));

  const rows: SkuRow[] = [];
  for (const pr of products) {
    const o = ordersM.get(pr.nmId);
    const sS = salesSM.get(pr.nmId);
    const sR = salesRM.get(pr.nmId);
    const a = advM.get(pr.nmId);
    const st = stocksM.get(pr.nmId);

    const buyoutsCount = (sS?._count ?? 0) - (sR?._count ?? 0);
    const buyoutsSum = num(sS?._sum.forPay) - num(sR?._sum.forPay);
    const cogs = cogsByNm.get(pr.nmId.toString())?.cogs ?? 0;
    const advSpend = num(a?._sum.spend);
    // на уровне SKU логистика — оценка (факт финотчёта на SKU не аллоцирован; бленд — на Пульсе/P&L)
    const logistics = Math.max(0, buyoutsCount) * Number(process.env.EST_LOGISTICS_RUB ?? 55);
    const retail = Math.max(0, buyoutsSum / 0.75);
    const vat = (retail * 0.07) / 1.07;
    const tax = Math.max(0, vat + 0.02 * (retail - vat));
    const profit = buyoutsSum - cogs - advSpend - logistics - tax;

    const stock = num(st?._sum.qty);
    const perDay = (o?._count ?? 0) / days;
    rows.push({
      nmId: Number(pr.nmId), vendorCode: pr.vendorCode, title: pr.title, photoUrl: pr.photoUrl,
      ordersCount: o?._count ?? 0, ordersSum: num(o?._sum.priceWithDisc),
      buyoutsCount, buyoutsSum, advSpend, cogs, profit,
      marg: buyoutsSum ? profit / buyoutsSum : 0,
      drr: num(o?._sum.priceWithDisc) > 0 ? advSpend / num(o?._sum.priceWithDisc) : 0,
      stock, stockDays: perDay > 0 ? Math.round(stock / perDay) : null,
    });
  }
  return rows.sort((a, b) => b.ordersSum - a.ordersSum);
}

/** P&L за месяц: факт финотчёта + оценка сверху */
export async function pnlMonth(year: number, month: number, userCabinets: string[]) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  const cabinets = await scopedCabinets(userCabinets);
  const cabWhere = { cabinetSid: { in: cabinets } };

  const fin = await db.finreportRow.aggregate({
    where: { ...cabWhere, rrDt: { gte: from, lt: to } },
    _sum: {
      retailAmount: true, ppvzForPay: true, deliveryRub: true, storageFee: true,
      acceptance: true, penalty: true, deduction: true, acquiringFee: true, ppvzVw: true,
    },
  });
  const est = await pulseTotals({ from, to }, cabinets);
  const indirect = await db.indirectExpense.findMany({
    where: { monthFrom: { lte: from }, monthTo: { gte: from } },
  });
  const indirectSum = indirect.reduce((s, e) => s + num(e.amount), 0);

  const hasFact = num(fin._sum.retailAmount) > 0;
  return {
    hasFact,
    fact: {
      retail: num(fin._sum.retailAmount),
      forPay: num(fin._sum.ppvzForPay),
      logistics: num(fin._sum.deliveryRub),
      storage: num(fin._sum.storageFee),
      acceptance: num(fin._sum.acceptance),
      penalty: num(fin._sum.penalty),
      deduction: num(fin._sum.deduction),
      acquiring: num(fin._sum.acquiringFee),
      commission: num(fin._sum.ppvzVw),
    },
    est,
    indirectSum,
    net: (hasFact
      ? num(fin._sum.ppvzForPay) - num(fin._sum.deliveryRub) - num(fin._sum.storageFee)
        - num(fin._sum.penalty) - num(fin._sum.deduction) - est.cogs - est.advSpend - est.tax
      : est.profit) - indirectSum,
  };
}

export type RnpSkuDay = {
  nmId: number; title: string; vendorCode: string;
  ordersCount: number; ordersSum: number; buyoutsCount: number; buyoutsSum: number;
  advSpend: number; drr: number;
};

/** Детализация РНП: разбивка каждого дня по SKU (для раскрывающихся строк) */
export async function rnpDayDetails(p: Period, userCabinets: string[]): Promise<Record<string, RnpSkuDay[]>> {
  const cabinets = await scopedCabinets(userCabinets);
  if (!cabinets.length) return {};

  const [orders, sales, adv, products] = await Promise.all([
    db.$queryRaw<{ d: Date; nmid: bigint; cnt: number; sum: number }[]>`
      SELECT date_trunc('day', o."date") d, o."nmId" nmid, COUNT(*)::int cnt, COALESCE(SUM(o."priceWithDisc"),0)::float sum
      FROM "Order" o
      WHERE o."date" >= ${p.from} AND o."date" < ${p.to} AND o."isCancel" = false AND o."cabinetSid" = ANY(${cabinets})
      GROUP BY 1, 2`,
    db.$queryRaw<{ d: Date; nmid: bigint; cnt: number; sum: number }[]>`
      SELECT date_trunc('day', s."date") d, s."nmId" nmid,
             SUM(CASE WHEN s."type"='S' THEN 1 WHEN s."type"='R' THEN -1 ELSE 0 END)::int cnt,
             COALESCE(SUM(CASE WHEN s."type"='S' THEN s."forPay" WHEN s."type"='R' THEN -s."forPay" ELSE 0 END),0)::float sum
      FROM "Sale" s
      WHERE s."date" >= ${p.from} AND s."date" < ${p.to} AND s."cabinetSid" = ANY(${cabinets})
      GROUP BY 1, 2`,
    db.$queryRaw<{ d: Date; nmid: bigint; spend: number }[]>`
      SELECT a."date" d, a."nmId" nmid, COALESCE(SUM(a."spend"),0)::float spend
      FROM "AdvDaily" a
      WHERE a."date" >= ${p.from} AND a."date" < ${p.to} AND a."cabinetSid" = ANY(${cabinets})
      GROUP BY 1, 2`,
    db.product.findMany({ where: { cabinetSid: { in: cabinets } }, select: { nmId: true, title: true, vendorCode: true } }),
  ]);

  const prodMap = new Map(products.map(pr => [pr.nmId.toString(), pr]));
  const out: Record<string, Record<string, RnpSkuDay>> = {};
  const cell = (d: Date, nmid: bigint): RnpSkuDay => {
    const day = d.toISOString().slice(0, 10);
    const k = nmid.toString();
    out[day] ??= {};
    if (!out[day][k]) {
      const pr = prodMap.get(k);
      out[day][k] = {
        nmId: Number(nmid), title: pr?.title ?? k, vendorCode: pr?.vendorCode ?? "",
        ordersCount: 0, ordersSum: 0, buyoutsCount: 0, buyoutsSum: 0, advSpend: 0, drr: 0,
      };
    }
    return out[day][k];
  };
  for (const r of orders) { const c = cell(r.d, r.nmid); c.ordersCount = r.cnt; c.ordersSum = r.sum; }
  for (const r of sales) { const c = cell(r.d, r.nmid); c.buyoutsCount = r.cnt; c.buyoutsSum = r.sum; }
  for (const r of adv) { if (r.nmid === 0n) continue; const c = cell(r.d, r.nmid); c.advSpend = r.spend; }

  const result: Record<string, RnpSkuDay[]> = {};
  for (const [day, byNm] of Object.entries(out)) {
    const rows = Object.values(byNm);
    for (const r of rows) r.drr = r.ordersSum ? r.advSpend / r.ordersSum : 0;
    result[day] = rows.sort((a, b) => b.ordersSum - a.ordersSum);
  }
  return result;
}

/** Drift%: насколько live-оценка разошлась с фактом финотчёта за последнюю закрытую неделю.
 *  Сверяем «к перечислению»: Σ forPay продаж-возвратов (оценка) против Σ ppvzForPay (факт). */
export async function weeklyDrift(userCabinets: string[]) {
  const cabinets = await scopedCabinets(userCabinets);
  const cabWhere = { cabinetSid: { in: cabinets } };

  const last = await db.finreportRow.aggregate({ where: cabWhere, _max: { rrDt: true } });
  if (!last._max.rrDt) return null;
  const end = new Date(new Date(last._max.rrDt.toISOString().slice(0, 10)).getTime() + 864e5);
  const start = new Date(end.getTime() - 7 * 864e5);

  const [fact, est] = await Promise.all([
    db.finreportRow.aggregate({
      where: { ...cabWhere, rrDt: { gte: start, lt: end } },
      _sum: { ppvzForPay: true, deliveryRub: true },
    }),
    db.sale.groupBy({
      by: ["type"],
      where: { ...cabWhere, date: { gte: start, lt: end } },
      _sum: { forPay: true },
    }),
  ]);
  const factForPay = num(fact._sum.ppvzForPay);
  const estForPay = num(est.find(e => e.type === "S")?._sum.forPay) - num(est.find(e => e.type === "R")?._sum.forPay);
  if (factForPay === 0) return null;

  return {
    weekStart: start, weekEnd: new Date(end.getTime() - 864e5),
    estForPay, factForPay,
    factLogistics: num(fact._sum.deliveryRub),
    driftPct: (estForPay / factForPay - 1) * 100,
  };
}

/** Свежесть данных для шапки и алертов: ok = запуск был и он не старше порога (аудит #24) */
const FRESH_MAX_H: Record<string, number> = {
  orders: 2, sales: 2, stocks: 16, adv: 3, finreport: 8 * 24, mpstats: 30, fx: 30,
};
export async function freshness() {
  const out: { name: string; at: Date | null; ok: boolean }[] = [];
  for (const [name, maxH] of Object.entries(FRESH_MAX_H)) {
    const last = await db.collectorRun.findFirst({
      where: { name, status: "ok" }, orderBy: { startedAt: "desc" },
    });
    const ok = !!last && (Date.now() - last.startedAt.getTime()) / 36e5 < maxH;
    out.push({ name, at: last?.startedAt ?? null, ok });
  }
  return out;
}
