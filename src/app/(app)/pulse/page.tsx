// Пульс бизнеса: плитки периода, график, алерты, свежесть данных
import { requireModule, moneyLevel, cabinetScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { pulseTotals, rnpByDay, freshness, weeklyDrift, skuTable } from "@/lib/pl";
import { resolvePeriod } from "@/lib/period";
import { fmtRub, fmtNum, fmtPct } from "@/lib/format";
import { Tile, Empty } from "@/components/ui";
import { PulseTile } from "@/components/PulseTile";
import { DoodleChart } from "@/components/doodles";
import { PeriodSeg } from "@/components/PeriodSeg";
import { CurrencySeg } from "@/components/CurrencySeg";
import { FxTrend } from "@/components/FxTrend";
import { OrdersChart } from "@/components/charts";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

// weeklyDrift тяжёлая (читает FinreportRow ~2.9 млн строк) и меняется раз в неделю —
// кэшируем на 30 мин, чтобы не блокировать рендер Пульса на каждой загрузке
// (инцидент «медленный Пульс / weeklyDrift ~42 с» 13.06.2026).
const driftCached = unstable_cache(
  async (cabs: string[]) => weeklyDrift(cabs),
  ["pulse-weekly-drift"],
  { revalidate: 1800 },
);

const ALERT_LABELS: Record<string, string> = {
  collector_error: "Ошибка коллектора",
  collector_silent: "Коллектор молчит",
  token_expiry: "Токен истекает",
  fx_delta: "Курс изменился",
  oos_risk: "Риск out-of-stock",
  drr_over_limit: "ДРР выше лимита",
};

export default async function PulsePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requireModule("pulse");
  const { p } = await searchParams;
  const { cookies } = await import("next/headers");
  const ck = await cookies();
  const { key, period } = resolvePeriod(p, "today");
  const lvl = moneyLevel(user);
  const curCab = ck.get("wbboard_cab")?.value || "all";
  const cab = cabinetScope(user, curCab);

  const [t, days, alerts, fresh, driftRaw, fx, fxHist] = await Promise.all([
    pulseTotals(period, cab),
    rnpByDay(period, cab),
    db.alert.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    freshness(),
    driftCached(cab),
    db.fxRate.findFirst({ orderBy: { date: "desc" } }),
    db.fxRate.findMany({ orderBy: { date: "desc" }, take: 30, select: { usdRubCash: true, usdRubCbr: true } }),
  ]);
  // unstable_cache сериализует Date → строки: восстанавливаем объекты Date для toLocaleDateString
  const drift = driftRaw ? { ...driftRaw, weekStart: new Date(driftRaw.weekStart), weekEnd: new Date(driftRaw.weekEnd) } : null;
  const fxPoints = fxHist.map(r => Number(r.usdRubCash ?? r.usdRubCbr ?? 0)).filter(v => v > 0).reverse();
  // дневные ряды для мини-графиков в плитках (как в Shopify/Lemon Squeezy)
  const sparkOrders = days.map(d => d.ordersSum);
  const sparkBuyouts = days.map(d => d.buyoutsSum);
  const sparkAdv = days.map(d => d.advSpend);

  // Валюта: ₽ по умолчанию или $ по курсу (usdRubCash приоритетнее ЦБ — §16)
  const rate = Number(fx?.usdRubCash ?? fx?.usdRubCbr ?? 0) || 0;
  const cur: "rub" | "usd" = ck.get("wbboard_cur")?.value === "usd" && rate > 0 ? "usd" : "rub";
  const usd = (v: number) => "$ " + fmtNum(Math.round(v / rate));
  const money = (v: number) => (cur === "usd" ? usd(v) : fmtRub(v));

  const hasData = t.ordersCount > 0 || t.buyoutsCount > 0;

  // Разбивка по товарам для раскрытия плиток «Заказы» и «Выкупы»
  const sku = hasData ? await skuTable(period, cab) : [];
  const ordersItems = sku.filter(s => s.ordersCount > 0).sort((a, b) => b.ordersSum - a.ordersSum);
  const buyoutsItems = sku.filter(s => s.buyoutsCount > 0).sort((a, b) => b.buyoutsSum - a.buyoutsSum);
  const ordersDetail = ordersItems.slice(0, 15).map(s => ({
    nmId: s.nmId, title: s.title, vendorCode: s.vendorCode, count: s.ordersCount, sum: money(s.ordersSum),
  }));
  const buyoutsDetail = buyoutsItems.slice(0, 15).map(s => ({
    nmId: s.nmId, title: s.title, vendorCode: s.vendorCode, count: s.buyoutsCount, sum: money(s.buyoutsSum),
  }));

  // Разбивка по кабинетам — показываем под суммой в плитках, когда выбрано «Все кабинеты»
  let cabOrders: { name: string; value: string; sub?: string }[] = [];
  let cabBuyouts: { name: string; value: string; sub?: string }[] = [];
  let cabAdv: { name: string; value: string; sub?: string }[] = [];
  if (curCab === "all" && hasData) {
    const cabsList = await db.cabinet.findMany({ where: { active: true }, select: { sid: true, name: true } });
    const nameOf = (sid: string) => cabsList.find(c => c.sid === sid)?.name ?? sid;
    const cw = cab.length ? { cabinetSid: { in: cab } } : {};
    const [og, sg, ag] = await Promise.all([
      db.order.groupBy({ by: ["cabinetSid"], where: { ...cw, date: { gte: period.from, lt: period.to }, isCancel: false }, _sum: { priceWithDisc: true }, _count: { _all: true } }),
      db.sale.groupBy({ by: ["cabinetSid", "type"], where: { ...cw, date: { gte: period.from, lt: period.to } }, _sum: { forPay: true }, _count: { _all: true } }),
      db.advDaily.groupBy({ by: ["cabinetSid"], where: { ...cw, date: { gte: period.from, lt: period.to } }, _sum: { spend: true } }),
    ]);
    type Agg = { oSum: number; oCnt: number; bSum: number; bCnt: number; adv: number };
    const m = new Map<string, Agg>();
    const get = (sid: string) => { let a = m.get(sid); if (!a) { a = { oSum: 0, oCnt: 0, bSum: 0, bCnt: 0, adv: 0 }; m.set(sid, a); } return a; };
    for (const o of og) { const a = get(o.cabinetSid); a.oSum = Number(o._sum.priceWithDisc ?? 0); a.oCnt = o._count._all; }
    for (const s of sg) { const a = get(s.cabinetSid); if (s.type === "S") { a.bSum += Number(s._sum.forPay ?? 0); a.bCnt += s._count._all; } else if (s.type === "R") { a.bSum -= Number(s._sum.forPay ?? 0); } }
    for (const x of ag) { const a = get(x.cabinetSid); a.adv = Number(x._sum.spend ?? 0); }
    const ent = [...m.entries()];
    const shareOf = (part: number, total: number) => total > 0 ? fmtPct(part / total, 0) : undefined;
    cabOrders = ent.filter(([, a]) => a.oSum > 0).sort((p, q) => q[1].oSum - p[1].oSum)
      .map(([sid, a]) => ({ name: nameOf(sid), value: `${money(a.oSum)} · ${fmtNum(a.oCnt)} шт`, sub: shareOf(a.oSum, t.ordersSum) }));
    cabBuyouts = ent.filter(([, a]) => a.bSum !== 0).sort((p, q) => q[1].bSum - p[1].bSum)
      .map(([sid, a]) => ({ name: nameOf(sid), value: `${money(a.bSum)} · ${fmtNum(a.bCnt)} шт`, sub: shareOf(a.bSum, t.buyoutsSum) }));
    cabAdv = ent.filter(([, a]) => a.adv > 0).sort((p, q) => q[1].adv - p[1].adv)
      .map(([sid, a]) => ({ name: nameOf(sid), value: `${money(a.adv)} · ДРР ${fmtPct(a.oSum ? a.adv / a.oSum : 0)}`, sub: shareOf(a.adv, t.advSpend) }));
  }

  return (
    <>
      <h1>Пульс бизнеса</h1>
      <p className="sub">
        Live-оценка до прихода финотчёта · налоговый режим УСН 2% + НДС 7%
        {cur === "usd" && <> · в долларах по курсу {rate.toFixed(2)} ₽/$ ({fx?.source})</>}
        {drift && (
          <>
            {" · "}
            <span
              className={`chip ${Math.abs(drift.driftPct) < 5 ? "ok" : Math.abs(drift.driftPct) < 10 ? "warn" : "bad"}`}
              title={`Неделя ${drift.weekStart.toLocaleDateString("ru-RU")}–${drift.weekEnd.toLocaleDateString("ru-RU")}: оценка ${fmtRub(drift.estForPay)} против факта ${fmtRub(drift.factForPay)}`}
            >
              сверка с финотчётом: {drift.driftPct >= 0 ? "+" : ""}{drift.driftPct.toFixed(1)}%
            </span>
          </>
        )}
      </p>
      <PeriodSeg base="/pulse" current={key} />
      <CurrencySeg current={cur} rate={rate} />
      <FxTrend points={fxPoints} source={fx?.source ?? undefined} />

      {!hasData ? (
        <Empty
          art={<DoodleChart />}
          title="Данных за период пока нет"
          hint="Подключите токен кабинета в Настройках — коллекторы начнут собирать заказы каждые 30 минут. Либо запустите демо-данные: npm run seed."
        />
      ) : (
        <>
          <div className="cards tiles">
            <PulseTile label="Заказы" value={money(t.ordersSum)} valueNote={`${fmtNum(t.ordersCount)} шт`}
              spark={sparkOrders} breakdown={cabOrders}
              items={ordersDetail} totalSkus={ordersItems.length} />
            <PulseTile label="Выкупы (к перечислению)" value={money(t.buyoutsSum)} valueNote={`${fmtNum(t.buyoutsCount)} шт`}
              spark={sparkBuyouts} rows={[{ k: "возвраты", v: money(t.returnsSum) }]}
              breakdown={cabBuyouts}
              items={buyoutsDetail} totalSkus={buyoutsItems.length} />
            <Tile label="Реклама" value={money(t.advSpend)}
              chip={{ text: `ДРР ${fmtPct(t.drr)}`, tone: t.drr > 0.15 ? "bad" : t.drr > 0.1 ? "warn" : "ok" }}
              spark={sparkAdv} breakdown={cabAdv} />
            {lvl === "A" && (
              <Tile label="COGS + логистика" value={money(t.cogs + t.logistics)}
                rows={[{ k: "себестоимость", v: money(t.cogs) }, { k: "логистика+хран.", v: money(t.logistics + t.storage) }]} />
            )}
            {lvl !== "C" && (
              <Tile label={lvl === "A" ? "Прибыль (оценка)" : "Маржа (оценка)"}
                value={lvl === "A" ? money(t.profit) : fmtPct(t.marg)}
                chip={{ text: fmtPct(t.marg), tone: t.marg > 0.15 ? "ok" : t.marg > 0 ? "warn" : "bad" }}
                net={lvl === "A" ? { k: "налог (оценка)", v: money(t.tax) } : undefined} />
            )}
          </div>

          <h2>Динамика по дням</h2>
          <div className="card">
            <OrdersChart data={days.map(d => ({ date: d.date, ordersSum: d.ordersSum, buyoutsSum: d.buyoutsSum, advSpend: d.advSpend }))} />
          </div>
        </>
      )}

      <h2>Алерты</h2>
      {alerts.length === 0 && <p className="mut sm">Пока пусто — алерты появятся при работе коллекторов.</p>}
      {alerts.map(a => (
        <div key={String(a.id)} className={`alert ${a.severity}`}>
          <span className="ava">W</span>
          <span className="sev" />
          <span className="t">
            {ALERT_LABELS[a.type] ?? a.type}
            <small>{JSON.stringify(a.payload)}</small>
          </span>
          <span className="sm mut">{a.createdAt.toLocaleString("ru-RU")}</span>
        </div>
      ))}

      <h2>Свежесть данных</h2>
      <div className="statusline">
        {fresh.map(f => (
          <span key={f.name} className={`chip ${f.ok ? "ok" : "mut"}`}>
            {f.name}: {f.at ? f.at.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "не запускался"}
          </span>
        ))}
      </div>
    </>
  );
}
