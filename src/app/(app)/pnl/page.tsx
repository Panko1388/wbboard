// P&L · ОПиУ: водопад месяца, факт финотчёта против live-оценки
import { cookies } from "next/headers";
import { requireModule, moneyLevel, cabinetScope } from "@/lib/auth";
import { pnlMonth, weeklyDrift } from "@/lib/pl";
import { fmtRub, fmtPct } from "@/lib/format";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PnlPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requireModule("pnl");
  if (moneyLevel(user) === "C") {
    return (<><h1>P&L · ОПиУ</h1><Empty title="Недостаточно прав" hint="Финансовые данные скрыты для вашей роли" /></>);
  }
  const { m } = await searchParams;
  const now = new Date();
  const [y, mo] = (m ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`)
    .split("-").map(Number);
  const cab = cabinetScope(user, (await cookies()).get("wbboard_cab")?.value);
  const [pnl, drift] = await Promise.all([pnlMonth(y, mo, cab), weeklyDrift(cab)]);
  const lvl = moneyLevel(user);

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });

  const cur = `${y}-${String(mo).padStart(2, "0")}`;
  const e = pnl.est;
  const wf = [
    { l: "Выкупы (forPay)", v: e.buyoutsSum, color: "#2b59ff" },
    { l: "COGS", v: -e.cogs, color: "#dc2626" },
    { l: "Логистика", v: -e.logistics, color: "#d97706" },
    { l: "Хранение", v: -e.storage, color: "#d97706" },
    { l: "Реклама", v: -e.advSpend, color: "#dc2626" },
    { l: "Налог", v: -e.tax, color: "#697086" },
    { l: "Косвенные", v: -pnl.indirectSum, color: "#697086" },
    { l: "Чистая", v: pnl.net, color: "#16a34a" },
  ];
  const maxAbs = Math.max(...wf.map(c => Math.abs(c.v)), 1);

  return (
    <>
      <h1>P&L · ОПиУ — {cur}</h1>
      <p className="sub">
        {pnl.hasFact ? "Факт из финотчёта WB v5 + оценка по незакрытым неделям" : "Финотчёта за месяц ещё нет — показана live-оценка"}
      </p>
      <div className="seg" style={{ display: "inline-flex", marginBottom: 14 }}>
        {months.map(mm => (
          <a key={mm} href={`/pnl?m=${mm}`} className={mm === cur ? "on" : ""}>{mm}</a>
        ))}
      </div>

      {lvl === "A" && (
        // Водопад с COGS и ₽ — только уровень A (аудит #4: B видит маржу без ₽ и COGS)
        <div className="card">
          <div className="wf">
            {wf.map(c => (
              <div className="col" key={c.l}>
                <span className="v num">{fmtRub(c.v)}</span>
                <div className="b" style={{ height: `${Math.max(4, (Math.abs(c.v) / maxAbs) * 120)}px`, background: c.color, opacity: c.v < 0 ? 0.75 : 1 }} />
                <span className="l">{c.l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Оценка (live)</h2>
          <div className="ul">
            <div className="li"><span>Заказы</span><b className="num">{fmtRub(e.ordersSum)}</b></div>
            <div className="li"><span>Выкупы (к перечислению)</span><b className="num">{fmtRub(e.buyoutsSum)}</b></div>
            {lvl === "A" && <div className="li"><span>COGS</span><b className="num">−{fmtRub(e.cogs)}</b></div>}
            <div className="li"><span>Логистика</span><b className="num">−{fmtRub(e.logistics)}</b></div>
            <div className="li"><span>Хранение</span><b className="num">−{fmtRub(e.storage)}</b></div>
            <div className="li"><span>Реклама (ДРР {fmtPct(e.drr)})</span><b className="num">−{fmtRub(e.advSpend)}</b></div>
            <div className="li"><span>Налог УСН 2% + НДС 7/107</span><b className="num">−{fmtRub(e.tax)}</b></div>
            {lvl === "A" && <div className="li"><span>Косвенные расходы</span><b className="num">−{fmtRub(pnl.indirectSum)}</b></div>}
            <div className="li tot">
              <span>{lvl === "A" ? "Чистая прибыль" : "Маржа (оценка)"}</span>
              <b className="num">{lvl === "A" ? fmtRub(pnl.net) : fmtPct(e.marg)}</b>
            </div>
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Факт финотчёта WB</h2>
          {!pnl.hasFact ? <p className="mut sm">Строк финотчёта за месяц нет. Отчёт формируется еженедельно (к среде), коллектор заберёт автоматически.</p> : (
            <div className="ul">
              <div className="li"><span>Продажа (розница)</span><b className="num">{fmtRub(pnl.fact.retail)}</b></div>
              <div className="li"><span>К перечислению</span><b className="num">{fmtRub(pnl.fact.forPay)}</b></div>
              <div className="li"><span>Комиссия WB</span><b className="num">−{fmtRub(pnl.fact.commission)}</b></div>
              <div className="li"><span>Логистика</span><b className="num">−{fmtRub(pnl.fact.logistics)}</b></div>
              <div className="li"><span>Хранение</span><b className="num">−{fmtRub(pnl.fact.storage)}</b></div>
              <div className="li"><span>Приёмка</span><b className="num">−{fmtRub(pnl.fact.acceptance)}</b></div>
              <div className="li"><span>Штрафы</span><b className="num">−{fmtRub(pnl.fact.penalty)}</b></div>
              <div className="li"><span>Прочие удержания</span><b className="num">−{fmtRub(pnl.fact.deduction)}</b></div>
              <div className="li"><span>Эквайринг</span><b className="num">−{fmtRub(pnl.fact.acquiring)}</b></div>
              {drift && (
                <div className="li tot">
                  <span>Drift оценки за неделю {drift.weekStart.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}–{drift.weekEnd.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}</span>
                  <b className="num">
                    <span className={`chip ${Math.abs(drift.driftPct) < 5 ? "ok" : Math.abs(drift.driftPct) < 10 ? "warn" : "bad"}`}>
                      {drift.driftPct >= 0 ? "+" : ""}{drift.driftPct.toFixed(1)}%
                    </span>
                  </b>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
