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
import { OrdersChart } from "@/components/charts";

export const dynamic = "force-dynamic";

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

  const [t, days, alerts, fresh, drift, fx] = await Promise.all([
    pulseTotals(period, cab),
    rnpByDay(period, cab),
    db.alert.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    freshness(),
    weeklyDrift(cab),
    db.fxRate.findFirst({ orderBy: { date: "desc" } }),
  ]);

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
  let cabOrders: { k: string; v: string }[] = [];
  let cabBuyouts: { k: string; v: string }[] = [];
  if (curCab === "all" && hasData) {
    const cabsList = await db.cabinet.findMany({ where: { active: true }, select: { sid: true, name: true } });
    const nameOf = (sid: string) => cabsList.find(c => c.sid === sid)?.name ?? sid;
    const cw = cab.length ? { cabinetSid: { in: cab } } : {};
    const [og, sg] = await Promise.all([
      db.order.groupBy({ by: ["cabinetSid"], where: { ...cw, date: { gte: period.from, lt: period.to }, isCancel: false }, _sum: { priceWithDisc: true }, _count: { _all: true } }),
      db.sale.groupBy({ by: ["cabinetSid", "type"], where: { ...cw, date: { gte: period.from, lt: period.to } }, _sum: { forPay: true }, _count: { _all: true } }),
    ]);
    cabOrders = og
      .map(o => ({ sid: o.cabinetSid, sum: Number(o._sum.priceWithDisc ?? 0), count: o._count._all }))
      .sort((a, b) => b.sum - a.sum)
      .map(o => ({ k: nameOf(o.sid), v: `${money(o.sum)} · ${fmtNum(o.count)}` }));
    const byCab = new Map<string, { sum: number; count: number }>();
    for (const s of sg) {
      const cur = byCab.get(s.cabinetSid) ?? { sum: 0, count: 0 };
      if (s.type === "S") { cur.sum += Number(s._sum.forPay ?? 0); cur.count += s._count._all; }
      else if (s.type === "R") { cur.sum -= Number(s._sum.forPay ?? 0); }
      byCab.set(s.cabinetSid, cur);
    }
    cabBuyouts = [...byCab.entries()].sort((a, b) => b[1].sum - a[1].sum).map(([sid, v]) => ({ k: nameOf(sid), v: `${money(v.sum)} · ${fmtNum(v.count)}` }));
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
              rows={cabOrders}
              items={ordersDetail} totalSkus={ordersItems.length} />
            <PulseTile label="Выкупы (к перечислению)" value={money(t.buyoutsSum)} valueNote={`${fmtNum(t.buyoutsCount)} шт`}
              rows={[{ k: "возвраты", v: money(t.returnsSum) }, ...cabBuyouts]}
              items={buyoutsDetail} totalSkus={buyoutsItems.length} />
            <Tile label="Реклама" value={money(t.advSpend)}
              chip={{ text: `ДРР ${fmtPct(t.drr)}`, tone: t.drr > 0.15 ? "bad" : t.drr > 0.1 ? "warn" : "ok" }} />
            {lvl === "A" && (
              <Tile label="COGS + логистика" value={money(t.cogs + t.logistics)}
                rows={[{ k: "себестоимость", v: money(t.cogs) }, { k: "логистика+хранение", v: money(t.logistics + t.storage) }]} />
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
