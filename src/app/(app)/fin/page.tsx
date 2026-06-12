// Финансы: финотчёты, косвенные расходы, валюта
import { cookies } from "next/headers";
import { requireModule, moneyLevel, cabinetScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtRub, fmtNum } from "@/lib/format";
import { Empty } from "@/components/ui";
import { DoodleCoins } from "@/components/doodles";
import { addIndirect } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function FinPage() {
  const user = await requireModule("fin");
  if (moneyLevel(user) !== "A") {
    return (<><h1>Финансы</h1><Empty title="Недостаточно прав" hint="Раздел доступен ролям с уровнем денег A" /></>);
  }

  const cab = cabinetScope(user, (await cookies()).get("wbboard_cab")?.value);
  const cabWhere = cab.length ? { cabinetSid: { in: cab } } : {};
  const reports = await db.finreportRow.groupBy({
    by: ["realizationreportId"],
    where: cabWhere,
    _min: { rrDt: true }, _max: { rrDt: true },
    _sum: { retailAmount: true, ppvzForPay: true, deliveryRub: true, storageFee: true, penalty: true },
    orderBy: { _max: { rrDt: "desc" } },
    take: 12,
  });
  const indirect = await db.indirectExpense.findMany({ orderBy: { monthFrom: "desc" }, take: 12 });
  const fx = await db.fxRate.findMany({ orderBy: { date: "desc" }, take: 10 });

  return (
    <>
      <h1>Финансы</h1>
      <p className="sub">Еженедельные финотчёты WB · косвенные расходы · курс валют</p>

      <h2>Финотчёты (последние 12 недель)</h2>
      {reports.length === 0 ? (
        <Empty art={<DoodleCoins />} title="Финотчётов нет" hint="Коллектор finreport заберёт отчёты после подключения токена (backfill с 29.01.2024)" />
      ) : (
        <div className="tblwrap">
          <table>
            <thead>
              <tr><th>Отчёт</th><th>Период</th><th>Розница</th><th>К перечислению</th><th>Логистика</th><th>Хранение</th><th>Штрафы</th></tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={String(r.realizationreportId)}>
                  <td className="name num">{String(r.realizationreportId)}</td>
                  <td className="sm">{r._min.rrDt?.toLocaleDateString("ru-RU")} — {r._max.rrDt?.toLocaleDateString("ru-RU")}</td>
                  <td className="num">{fmtRub(Number(r._sum.retailAmount ?? 0))}</td>
                  <td className="num"><b>{fmtRub(Number(r._sum.ppvzForPay ?? 0))}</b></td>
                  <td className="num">−{fmtRub(Number(r._sum.deliveryRub ?? 0))}</td>
                  <td className="num">−{fmtRub(Number(r._sum.storageFee ?? 0))}</td>
                  <td className="num">−{fmtRub(Number(r._sum.penalty ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Косвенные расходы</h2>
          {indirect.length === 0 && <p className="mut sm">ФОТ, аренда, подписки — аллоцируются на P&L месяца.</p>}
          <div className="ul">
            {indirect.map(e => (
              <div className="li" key={e.id}>
                <span>{e.monthFrom.toISOString().slice(0, 7)} · {e.category}{e.comment ? ` (${e.comment})` : ""}</span>
                <b className="num">{fmtRub(Number(e.amount))}</b>
              </div>
            ))}
          </div>
          <form action={addIndirect} className="frm" style={{ marginTop: 10 }}>
            <label>Месяц<input type="month" name="month" defaultValue={new Date().toISOString().slice(0, 7)} /></label>
            <label>Категория<input type="text" name="category" placeholder="ФОТ" style={{ width: 110 }} /></label>
            <label>Сумма ₽<input type="number" name="amount" required style={{ width: 110 }} /></label>
            <button className="btn acc" type="submit">Добавить</button>
          </form>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Курс валют</h2>
          {fx.length === 0 && <p className="mut sm">Коллектор fx пишет курс ЦБ ежедневно в 10:00 МСК.</p>}
          <div className="ul">
            {fx.map(r => (
              <div className="li" key={r.date.toISOString()}>
                <span>{r.date.toLocaleDateString("ru-RU")} <span className="sm mut">({r.source})</span></span>
                <b className="num">
                  $ {r.usdRubCbr ? fmtNum(Number(r.usdRubCbr), 2) : "—"} · ¥ {r.cnyRub ? fmtNum(Number(r.cnyRub), 2) : "—"}
                  {r.usdRubCash ? ` · нал ${fmtNum(Number(r.usdRubCash), 2)}` : ""}
                </b>
              </div>
            ))}
          </div>
          <p className="sm mut" style={{ marginTop: 8 }}>
            Эффективный курс (stbank.by, кросс через BYN) фиксируется в партиях COGS при закупке — FX-репрайс сравнивает его с текущим ЦБ.
          </p>
        </div>
      </div>
    </>
  );
}
