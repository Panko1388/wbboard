// Товары: юнит-экономика по SKU + ввод партии COGS
import { cookies } from "next/headers";
import { requireModule, moneyLevel, cabinetScope } from "@/lib/auth";
import { skuTable, sppSeriesBySku } from "@/lib/pl";
import { resolvePeriod } from "@/lib/period";
import { fmtRub, fmtNum, fmtPct } from "@/lib/format";
import { PeriodSeg } from "@/components/PeriodSeg";
import { Empty, Pimg } from "@/components/ui";
import { Sparkline } from "@/components/Sparkline";
import { DoodleChart } from "@/components/doodles";
import { addCogsBatch } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requireModule("products");
  const { p } = await searchParams;
  const { key, period } = resolvePeriod(p, "today");
  const cab = cabinetScope(user, (await cookies()).get("wbboard_cab")?.value);
  const [rows, sppMap] = await Promise.all([skuTable(period, cab), sppSeriesBySku(cab)]);
  const lvl = moneyLevel(user);

  return (
    <>
      <h1>Товары · юнит-экономика</h1>
      <p className="sub">Прибыль = выкупы (forPay) − COGS − реклама − логистика (оценка) − налог УСН+НДС</p>
      <PeriodSeg base="/products" current={key} />

      {rows.length === 0 ? (
        <Empty art={<DoodleChart />} title="Каталог пуст" hint="Товары появятся автоматически из заказов и остатков после первого прохода коллекторов" />
      ) : (
        <div className="tblwrap">
          <table>
            <thead>
              <tr>
                <th>Товар</th><th>Заказы шт</th><th>Заказы ₽</th><th>Выкупы шт</th><th>Выкупы ₽</th>
                <th>Реклама</th><th>ДРР</th><th>СПП · 30д</th>{lvl === "A" && <th>COGS</th>}{lvl !== "C" && <th>{lvl === "A" ? "Прибыль" : "Маржа"}</th>}
                {lvl !== "C" && <th>Маржа %</th>}<th>Остаток</th><th>Хватит на</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.nmId}>
                  <td><Pimg url={r.photoUrl} nmId={r.nmId} /><span className="name">{r.title}</span> <span className="code">{r.vendorCode} · {r.nmId}</span></td>
                  <td className="num">{fmtNum(r.ordersCount)}</td>
                  <td className="num">{fmtRub(r.ordersSum)}</td>
                  <td className="num">{fmtNum(r.buyoutsCount)}</td>
                  <td className="num">{fmtRub(r.buyoutsSum)}</td>
                  <td className="num">{fmtRub(r.advSpend)}</td>
                  <td className="num">
                    {r.drr > 0
                      ? <span className={`chip ${r.drr > 0.15 ? "bad" : r.drr > 0.1 ? "warn" : "ok"}`}>{fmtPct(r.drr)}</span>
                      : <span className="chip mut">—</span>}
                  </td>
                  <td className="num">
                    {(() => {
                      const s = sppMap.get(String(r.nmId));
                      return s && s.current > 0
                        ? <span className="spp-cell"><b>{s.current}%</b><Sparkline points={s.series} className="spp-spark" /></span>
                        : <span className="chip mut">—</span>;
                    })()}
                  </td>
                  {lvl === "A" && <td className="num">{r.cogs ? fmtRub(r.cogs) : <span className="chip warn">нет COGS</span>}</td>}
                  {lvl !== "C" && <td className="num"><b>{lvl === "A" ? fmtRub(r.profit) : fmtPct(r.marg)}</b></td>}
                  {lvl !== "C" && (
                    <td className="num">
                      <span className={`chip ${r.marg > 0.15 ? "ok" : r.marg > 0 ? "warn" : "bad"}`}>{fmtPct(r.marg, 0)}</span>
                    </td>
                  )}
                  <td className="num">{fmtNum(r.stock)}</td>
                  <td className="num">
                    {r.stockDays === null ? <span className="chip mut">—</span>
                      : <span className={`chip ${r.stockDays < 14 ? "bad" : r.stockDays < 30 ? "warn" : "ok"}`}>{r.stockDays} дн</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lvl === "A" && (
        <>
          <h2>Добавить партию COGS</h2>
          <div className="card">
            <form action={addCogsBatch} className="frm">
              <label>nmId<input type="text" name="nmId" required placeholder="221450789" style={{ width: 130 }} /></label>
              <label>Кол-во<input type="number" name="qty" required style={{ width: 90 }} /></label>
              <label>Валюта
                <select name="currency" defaultValue="USD"><option>USD</option><option>CNY</option><option>RUB</option></select>
              </label>
              <label>Цена/шт<input type="number" name="priceCur" step="0.01" required style={{ width: 100 }} /></label>
              <label>Курс<input type="number" name="rate" step="0.01" placeholder="77.90" style={{ width: 90 }} /></label>
              <label>Карго ₽/шт<input type="number" name="delivery" step="0.1" style={{ width: 100 }} /></label>
              <button className="btn acc" type="submit">Добавить партию</button>
            </form>
            <p className="sm mut" style={{ marginTop: 8 }}>Обычно партии создаются автоматически при приёмке закупки (Остатки → Закупки). Ручной ввод — для истории и стартовых остатков.</p>
          </div>
        </>
      )}
    </>
  );
}
