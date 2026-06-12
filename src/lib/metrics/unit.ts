// Юнит-экономика — формулы из vault 50-metrics-spec-10x.md §4, §16, §17.
// Налоговый режим Андре: УСН «Доходы» 2% + НДС 7% БЕЗ вычетов. ОСНО — для what-if.

export type TaxMode = "usn_vat7" | "usn_vat5" | "usn_vat22" | "osno";

export interface UnitInput {
  price: number;          // цена до СПП
  sebesRub: number;       // из активной партии: priceCur * rateAtPurchase + deliveryPerUnit
  commissionPct: number;  // kgvp по предмету
  logisticsRub: number;   // тариф за литраж * коэф. склада
  buyoutPct: number;      // 0..1
  storagePerUnit: number;
  acquiringPct: number;   // ~0.026
  drr: number;            // 0..1
  vatRate?: number;       // для osno/usn_vat22: 0.22 | 0.10
}

export function unitEconomics(u: UnitInput, mode: TaxMode = "usn_vat7") {
  const com = u.price * u.commissionPct;
  const acq = u.price * u.acquiringPct;
  const logEff = u.logisticsRub / u.buyoutPct; // логистика на 1 выкуп
  let vat = 0, incomeTax = 0;
  if (mode === "usn_vat7" || mode === "usn_vat5") {
    const r = mode === "usn_vat7" ? 0.07 : 0.05;
    vat = (u.price * r) / (1 + r);            // без вычетов, единая ставка на все товары
    incomeTax = 0.02 * (u.price - vat);       // УСН «Доходы» 2% (Калмыкия 2026-2027)
  } else {
    const rate = u.vatRate ?? 0.22;
    const vatOut = (u.price * rate) / (1 + rate);
    const vatIn = ((com + logEff + u.storagePerUnit) * 0.22) / 1.22; // услуги WB; карго без ГТД не зачитывается
    vat = Math.max(0, vatOut - vatIn);
    const pre = u.price - (u.sebesRub + com + logEff + u.storagePerUnit + acq + vat);
    incomeTax = 0.2 * Math.max(0, pre);       // НДФЛ, ступень 20%
  }
  const costs = u.sebesRub + com + logEff + u.storagePerUnit + acq + vat + incomeTax;
  const profit = u.price - costs;
  const profitAdv = profit - u.price * u.drr;
  return { com, acq, logEff, vat, incomeTax, costs, profit, profitAdv,
    marg: profit / u.price, margAdv: profitAdv / u.price };
}

// FX-репрайс (§16): цена, сохраняющая $-прибыль уровня закупки
export function fxReprice(u: UnitInput, rateAtPurchase: number, rateNow: number, mode: TaxMode = "usn_vat7") {
  const e = unitEconomics(u, mode);
  const d = rateNow / rateAtPurchase - 1;
  const rv = mode === "usn_vat7" ? 0.07 / 1.07 : mode === "usn_vat5" ? 0.05 / 1.05 : 0.22 / 1.22;
  const absorb = 1 - u.commissionPct - u.acquiringPct - rv - 0.02 * (1 - rv);
  const dPrice = (e.profitAdv * d) / absorb;
  return { fxDelta: d, recommendedPrice: Math.round(u.price + dPrice), dPrice: Math.round(dPrice) };
}
