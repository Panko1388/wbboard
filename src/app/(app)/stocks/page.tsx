// Остатки и поставки: Остатки WB → Мой склад → Закупки (Китай) → Отгрузки на WB
import { cookies } from "next/headers";
import { requireModule, moneyLevel, cabinetScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtNum, fmtRub } from "@/lib/format";
import { Tabs, Empty, StageBar, Pimg } from "@/components/ui";
import { DoodleBoxes } from "@/components/doodles";
import { StockHistoryChart } from "@/components/charts";
import {
  createPO, setPOStatus, receivePO, createShipment, sendShipment, acceptShipment, adjustMyStock, runCollectorNow,
} from "@/app/actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "wb", label: "Остатки WB" },
  { key: "my", label: "Мой склад" },
  { key: "po", label: "Закупки" },
  { key: "ship", label: "Отгрузки на WB" },
];

const PO_STAGES = ["Черновик", "Оплачен", "В пути", "На складе", "Отгружен"];
const poStage = (st: string) =>
  ({ DRAFT: 0, ORDERED: 1, IN_TRANSIT: 2, AT_WAREHOUSE: 3, CLOSED: 4, CANCELLED: 0 }[st] ?? 0);

export default async function StocksPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireModule("stocks");
  const lvlA = moneyLevel(user) === "A";
  const cab = cabinetScope(user, (await cookies()).get("wbboard_cab")?.value);
  const { tab = "wb" } = await searchParams;

  return (
    <>
      <h1>Остатки и поставки</h1>
      <p className="sub">Цепочка: закупка у поставщика → карго → мой склад → отгрузка на WB → приёмка</p>
      <Tabs base="/stocks" items={TABS} current={tab} />
      {tab === "wb" && <WbStocks cabinets={cab} />}
      {tab === "my" && <MyWarehouse />}
      {tab === "po" && <PurchaseOrders lvlA={lvlA} />}
      {tab === "ship" && <Shipments cabinets={cab} />}
    </>
  );
}

// ── Остатки WB ──────────────────────────────────────────
async function WbStocks({ cabinets }: { cabinets: string[] }) {
  const { scopedCabinets } = await import("@/lib/pl");
  const cabs = await scopedCabinets(cabinets);
  const cabWhere = { cabinetSid: { in: cabs } };
  const lastSnap = await db.stockSnapshot.findFirst({ where: cabWhere, orderBy: { takenAt: "desc" } });
  if (!lastSnap) {
    return (
      <>
        <Empty art={<DoodleBoxes />} title="Снапшотов остатков WB пока нет" hint="Коллектор stocks снимает остатки 2 раза в день. Можно запустить сейчас:" />
        <form action={runCollectorNow} style={{ marginTop: 10 }}>
          <input type="hidden" name="name" value="stocks" />
          <button className="btn acc" type="submit">Собрать остатки сейчас</button>
        </form>
      </>
    );
  }

  // последний снапшот ПО КАЖДОМУ кабинету — у разных кабинетов разный takenAt (аудит #6)
  const lastPerCab = await db.stockSnapshot.groupBy({
    by: ["cabinetSid"], where: cabWhere, _max: { takenAt: true },
  });
  const rows = await db.stockSnapshot.groupBy({
    by: ["nmId"],
    where: { OR: lastPerCab.map(c => ({ cabinetSid: c.cabinetSid, takenAt: c._max.takenAt! })) },
    _sum: { qty: true, inWayToClient: true, inWayFromClient: true },
  });
  const products = await db.product.findMany({ where: { nmId: { in: rows.map(r => r.nmId) } } });
  // средние заказы в день за 14 дней для обеспеченности
  const since = new Date(Date.now() - 14 * 864e5);
  const orders = await db.order.groupBy({
    by: ["nmId"], where: { ...cabWhere, date: { gte: since }, isCancel: false }, _count: true,
  });

  // история за 30 дней: один (последний) снапшот на день, иначе 2 снапшота/день задваивают сумму (аудит #7)
  const hist = await db.$queryRaw<{ d: Date; qty: number }[]>`
    SELECT d, SUM(qty)::int qty FROM (
      SELECT date_trunc('day', s."takenAt") d, s.qty,
             ROW_NUMBER() OVER (
               PARTITION BY date_trunc('day', s."takenAt"), s."cabinetSid", s."nmId", s.warehouse
               ORDER BY s."takenAt" DESC) rn
      FROM "StockSnapshot" s
      WHERE s."takenAt" > now() - interval '30 days' AND s."cabinetSid" = ANY(${cabs})
    ) t WHERE rn = 1 GROUP BY d ORDER BY d`;

  const data = rows
    .map(r => {
      const p = products.find(x => x.nmId === r.nmId);
      const perDay = (orders.find(o => o.nmId === r.nmId)?._count ?? 0) / 14;
      const qty = r._sum.qty ?? 0;
      const days = perDay > 0 ? Math.round(qty / perDay) : null;
      return {
        nmId: Number(r.nmId), title: p?.title ?? String(r.nmId), code: p?.vendorCode ?? "", photo: p?.photoUrl,
        qty, toClient: r._sum.inWayToClient ?? 0, fromClient: r._sum.inWayFromClient ?? 0, days,
      };
    })
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <StockHistoryChart data={hist.map(h => ({ date: h.d.toISOString().slice(0, 10), qty: h.qty }))} />
      </div>
      <div className="tblwrap">
        <table>
          <thead>
            <tr><th>Товар</th><th>Остаток WB</th><th>К клиенту</th><th>От клиента</th><th>Хватит на</th></tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.nmId}>
                <td><Pimg url={r.photo} nmId={r.nmId} /><span className="name">{r.title}</span> <span className="code">{r.code} · {r.nmId}</span></td>
                <td className="num">{fmtNum(r.qty)}</td>
                <td className="num">{fmtNum(r.toClient)}</td>
                <td className="num">{fmtNum(r.fromClient)}</td>
                <td className="num">
                  {r.days === null ? <span className="chip mut">нет продаж</span>
                    : <span className={`chip ${r.days < 14 ? "bad" : r.days < 30 ? "warn" : "ok"}`}>{r.days} дн</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sm mut" style={{ marginTop: 8 }}>
        Снапшот: {lastSnap.takenAt.toLocaleString("ru-RU")} · порог алерта out-of-stock — 14 дней
      </p>
    </>
  );
}

// ── Мой склад ──────────────────────────────────────────
async function MyWarehouse() {
  const stocks = await db.myStock.findMany({ orderBy: { qty: "desc" } });
  const products = await db.product.findMany({ where: { nmId: { in: stocks.map(s => s.nmId) } } });
  const moves = await db.warehouseMove.findMany({ orderBy: { movedAt: "desc" }, take: 20 });

  const reasonLabel: Record<string, string> = {
    po_receive: "Приёмка закупки", shipment: "Отгрузка на WB", writeoff: "Списание", correction: "Корректировка",
  };

  return (
    <div className="grid32">
      <div>
        {stocks.length === 0
          ? <Empty title="Мой склад пуст" hint="Остатки появятся после приёмки закупки (вкладка «Закупки») или корректировкой справа" />
          : (
            <div className="tblwrap">
              <table>
                <thead><tr><th>Товар</th><th>На моём складе, шт</th><th>Обновлено</th></tr></thead>
                <tbody>
                  {stocks.map(s => {
                    const p = products.find(x => x.nmId === s.nmId);
                    return (
                      <tr key={String(s.nmId)}>
                        <td><Pimg url={p?.photoUrl} nmId={s.nmId} /><span className="name">{p?.title ?? String(s.nmId)}</span> <span className="code">{String(s.nmId)}</span></td>
                        <td className="num"><b>{fmtNum(s.qty)}</b></td>
                        <td className="num sm mut">{s.updatedAt.toLocaleDateString("ru-RU")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        <h2>Последние движения</h2>
        {moves.length === 0 ? <p className="mut sm">Движений пока нет.</p> : (
          <div className="tblwrap">
            <table>
              <thead><tr><th>Когда</th><th>Товар</th><th>Δ шт</th><th>Причина</th><th>Документ</th></tr></thead>
              <tbody>
                {moves.map(m => (
                  <tr key={String(m.id)}>
                    <td>{m.movedAt.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="num">{String(m.nmId)}</td>
                    <td className="num"><span className={m.qty >= 0 ? "up" : "dn"}>{m.qty > 0 ? "+" : ""}{fmtNum(m.qty)}</span></td>
                    <td>{reasonLabel[m.reason] ?? m.reason}</td>
                    <td className="sm mut">{m.refId ?? m.comment ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Корректировка</h2>
        <form action={adjustMyStock} className="frm" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>Артикул WB (nmId)<input type="text" name="nmId" required placeholder="221450789" /></label>
          <label>Δ количество (± шт)<input type="number" name="qty" required placeholder="-5 или 120" /></label>
          <label>Комментарий<input type="text" name="comment" placeholder="инвентаризация" /></label>
          <button className="btn acc" type="submit">Провести</button>
        </form>
      </div>
    </div>
  );
}

// ── Закупки ──────────────────────────────────────────
// Закупочные цены и карго — источник COGS: видны только уровню A (аудит #5)
async function PurchaseOrders({ lvlA }: { lvlA: boolean }) {
  const pos = await db.purchaseOrder.findMany({
    include: { items: true, supplier: true }, orderBy: { createdAt: "desc" },
  });

  return (
    <div className="grid32">
      <div>
        {pos.length === 0 && <Empty art={<DoodleBoxes />} title="Закупок пока нет" hint="Создайте первую закупку справа — позиции строками «nmId : шт : цена»" />}
        {pos.map(po => {
          const totalQty = po.items.reduce((s, i) => s + i.qty, 0);
          const totalCur = po.items.reduce((s, i) => s + i.qty * Number(i.priceCur), 0);
          return (
            <div className="card" key={po.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <b>{po.number}</b>
                {po.supplier && <span className="chip mut">{po.supplier.name}</span>}
                <span className="chip acc num">{fmtNum(totalQty)} шт{lvlA ? ` · ${fmtNum(totalCur)} ${po.currency}` : ""}</span>
                {lvlA && Number(po.cargoCostRub) > 0 && <span className="chip mut num">карго {fmtRub(Number(po.cargoCostRub))}</span>}
                {po.etaAt && po.status !== "AT_WAREHOUSE" && (
                  <span className="chip warn">ETA {po.etaAt.toLocaleDateString("ru-RU")}</span>
                )}
                <span className="sp" style={{ flex: 1 }} />
                {po.status === "DRAFT" && (
                  <form action={setPOStatus}>
                    <input type="hidden" name="id" value={po.id} /><input type="hidden" name="status" value="ORDERED" />
                    <button className="btn" type="submit">Оплачен →</button>
                  </form>
                )}
                {po.status === "ORDERED" && (
                  <form action={setPOStatus}>
                    <input type="hidden" name="id" value={po.id} /><input type="hidden" name="status" value="IN_TRANSIT" />
                    <button className="btn" type="submit">Карго в пути →</button>
                  </form>
                )}
                {po.status === "IN_TRANSIT" && (
                  <form action={receivePO}>
                    <input type="hidden" name="id" value={po.id} />
                    <button className="btn acc" type="submit">Принять на склад ✓</button>
                  </form>
                )}
              </div>
              <StageBar stages={PO_STAGES} current={poStage(po.status)} />
              <div className="ul" style={{ marginTop: 8 }}>
                {po.items.map(i => (
                  <div className="li" key={i.id}>
                    <span className="num">{String(i.nmId)}</span>
                    <span className="num">{fmtNum(i.qty)} шт{lvlA ? ` × ${fmtNum(Number(i.priceCur), 2)} ${po.currency}` : ""}
                      {i.receivedQty > 0 && <span className="chip ok" style={{ marginLeft: 8 }}>принято {i.receivedQty}</span>}
                    </span>
                  </div>
                ))}
              </div>
              {lvlA && po.status === "AT_WAREHOUSE" && (
                <p className="sm mut" style={{ marginTop: 6 }}>
                  Партии COGS созданы с курсом {Number(po.fxRate) || 1} и карго {fmtNum(Number(po.cargoCostRub) / (totalQty || 1), 1)} ₽/шт.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Новая закупка</h2>
        <form action={createPO} className="frm" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>Поставщик<input type="text" name="supplier" placeholder="Yiwu Trade Co." /></label>
          <label>Валюта
            <select name="currency" defaultValue="USD">
              <option value="USD">USD</option><option value="CNY">CNY</option><option value="RUB">RUB</option>
            </select>
          </label>
          <label>Курс к ₽ на дату оплаты<input type="number" name="fxRate" step="0.01" placeholder="77.90" /></label>
          <label>Карго итого, ₽<input type="number" name="cargoCostRub" step="1" placeholder="45000" /></label>
          <label>ETA прибытия<input type="date" name="etaAt" /></label>
          <label>Позиции — nmId : шт : цена (строка на позицию)
            <textarea name="items" rows={4} placeholder={"221450789 : 500 : 2.10\n221450790 : 300 : 3.40"} required />
          </label>
          <label>Комментарий<input type="text" name="comment" /></label>
          <button className="btn acc" type="submit">Создать ЗК</button>
        </form>
        <p className="sm mut" style={{ marginTop: 8 }}>
          При приёмке на склад автоматически создаются партии COGS с фиксацией курса (как в спеке §16) и карго на единицу.
        </p>
      </div>
    </div>
  );
}

// ── Отгрузки ──────────────────────────────────────────
async function Shipments({ cabinets }: { cabinets: string[] }) {
  const ships = await db.shipment.findMany({
    where: cabinets.length ? { cabinetSid: { in: cabinets } } : {},
    include: { items: true }, orderBy: { createdAt: "desc" },
  });
  const cabs = await db.cabinet.findMany({ where: { active: true } });
  const SHIP_STAGES = ["Черновик", "Отгружено", "Принято WB"];
  const shipStage = (st: string) => ({ DRAFT: 0, SENT: 1, ACCEPTED: 2, PARTIAL: 2, CANCELLED: 0 }[st] ?? 0);

  return (
    <div className="grid32">
      <div>
        {ships.length === 0 && <Empty title="Отгрузок пока нет" hint="Создайте отгрузку справа — остаток моего склада спишется при отправке" />}
        {ships.map(sh => (
          <div className="card" key={sh.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <b>{sh.number}</b>
              <span className="chip mut">{sh.warehouse}</span>
              {sh.wbSupplyId && <span className="chip mut">WB {sh.wbSupplyId}</span>}
              <span className="chip acc num">{fmtNum(sh.items.reduce((s, i) => s + i.qty, 0))} шт · {sh.boxCount} кор.</span>
              {sh.status === "PARTIAL" && <span className="chip warn">расхождения</span>}
              <span style={{ flex: 1 }} />
              {sh.status === "DRAFT" && (
                <form action={sendShipment}>
                  <input type="hidden" name="id" value={sh.id} />
                  <button className="btn acc" type="submit">Отгрузить →</button>
                </form>
              )}
            </div>
            <StageBar stages={SHIP_STAGES} current={shipStage(sh.status)} />
            {sh.status === "SENT" ? (
              <form action={acceptShipment} style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={sh.id} />
                <div className="ul">
                  {sh.items.map(i => (
                    <div className="li" key={i.id}>
                      <span className="num">{String(i.nmId)} — план {fmtNum(i.qty)}</span>
                      <span>принято: <input type="number" name={`acc_${i.id}`} defaultValue={i.qty} style={{ width: 90 }} /></span>
                    </div>
                  ))}
                </div>
                <button className="btn" type="submit" style={{ marginTop: 8 }}>Зафиксировать приёмку WB ✓</button>
              </form>
            ) : (
              <div className="ul" style={{ marginTop: 8 }}>
                {sh.items.map(i => (
                  <div className="li" key={i.id}>
                    <span className="num">{String(i.nmId)}</span>
                    <span className="num">{fmtNum(i.qty)} шт{sh.status !== "DRAFT" && i.acceptedQty !== i.qty
                      ? <span className="chip warn" style={{ marginLeft: 8 }}>принято {i.acceptedQty}</span>
                      : null}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Новая отгрузка</h2>
        <form action={createShipment} className="frm" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>Кабинет
            <select name="cabinetSid">
              {cabs.filter(c => !cabinets.length || cabinets.includes(c.sid)).map(c => (
                <option key={c.sid} value={c.sid}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>Склад WB<input type="text" name="warehouse" defaultValue="Коледино" /></label>
          <label>Коробов<input type="number" name="boxCount" defaultValue={1} /></label>
          <label>Номер поставки WB (опц.)<input type="text" name="wbSupplyId" /></label>
          <label>Позиции — nmId : шт<textarea name="items" rows={4} placeholder={"221450789 : 120"} required /></label>
          <button className="btn acc" type="submit">Создать отгрузку</button>
        </form>
      </div>
    </div>
  );
}
