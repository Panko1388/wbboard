"use client";
// РНП с раскрывающимися строками: клик по дню → детализация по SKU с фото
import { useState } from "react";
import type { DayRow, RnpSkuDay } from "@/lib/pl";
import { Photo } from "@/components/Photo";

const rub = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v) + " ₽";
const num = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => (v * 100).toFixed(1).replace(".", ",") + "%";

export function RnpTable({ days, details }: { days: DayRow[]; details: Record<string, RnpSkuDay[]> }) {
  // по умолчанию ВСЕ дни раскрыты (open[date] === false означает свёрнут вручную)
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (d: string) => setOpen(o => ({ ...o, [d]: o[d] === false ? true : false }));

  return (
    <div className="tblwrap">
      <table>
        <thead>
          <tr>
            <th>Дата</th><th>Заказы, ₽</th><th>Заказы, шт</th>
            <th>Выкупы, ₽</th><th>Выкупы, шт</th><th>Реклама, ₽</th><th>ДРР</th>
          </tr>
        </thead>
        <tbody>
          {days.map(d => {
            const rows = details[d.date] ?? [];
            const isOpen = open[d.date] !== false;
            return [
              <tr key={d.date} onClick={() => rows.length && toggle(d.date)}
                  className={rows.length ? "expandable" : ""}
                  style={rows.length ? { cursor: "pointer" } : undefined}>
                <td className="name">
                  <span className={`caret${isOpen ? " open" : ""}`}>{rows.length ? "▸" : ""}</span>
                  {d.date.slice(8)}.{d.date.slice(5, 7)}
                </td>
                <td className="num">{rub(d.ordersSum)}</td>
                <td className="num">{num(d.ordersCount)}</td>
                <td className="num">{rub(d.buyoutsSum)}</td>
                <td className="num">{num(d.buyoutsCount)}</td>
                <td className="num">{rub(d.advSpend)}</td>
                <td className="num">
                  <span className={`chip ${d.drr > 0.15 ? "bad" : d.drr > 0.1 ? "warn" : d.drr > 0 ? "ok" : "mut"}`}>{pct(d.drr)}</span>
                </td>
              </tr>,
              isOpen && rows.map(r => (
                <tr key={`${d.date}-${r.nmId}`} className="subrow">
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, paddingLeft: 18 }}>
                      <Photo nmId={r.nmId} />
                      <span>
                        <span className="name" style={{ display: "block", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</span>
                        <span className="code">{r.vendorCode} · {r.nmId}</span>
                      </span>
                    </span>
                  </td>
                  <td className="num">{rub(r.ordersSum)}</td>
                  <td className="num">{num(r.ordersCount)}</td>
                  <td className="num">{rub(r.buyoutsSum)}</td>
                  <td className="num">{num(r.buyoutsCount)}</td>
                  <td className="num">{r.advSpend ? rub(r.advSpend) : "—"}</td>
                  <td className="num">
                    {r.advSpend && r.ordersSum
                      ? <span className={`chip ${r.drr > 0.15 ? "bad" : r.drr > 0.1 ? "warn" : "ok"}`}>{pct(r.drr)}</span>
                      : <span className="chip mut">—</span>}
                  </td>
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
