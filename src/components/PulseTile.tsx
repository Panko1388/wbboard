"use client";
// Плитка Пульса с плавным раскрытием: клик по ВСЕЙ плитке → список товаров с фото и кол-вом.
import { useState } from "react";
import { Photo } from "@/components/Photo";

export type TileItem = { nmId: number; title: string; vendorCode: string; count: number; sum: string };

export function PulseTile({
  label, value, valueNote, rows, chip, net, items, totalSkus,
}: {
  label: string;
  value: string;
  valueNote?: string;
  rows?: { k: string; v: string }[];
  chip?: { text: string; tone: "ok" | "warn" | "bad" | "mut" };
  net?: { k: string; v: string };
  items: TileItem[];
  totalSkus: number;
}) {
  const [open, setOpen] = useState(false);
  const can = items.length > 0;

  return (
    <div className={`card tile expandable-tile${open ? " open" : ""}`}>
      {/* вся верхняя часть плитки — одна кликабельная зона */}
      <button
        type="button"
        className="tile-head"
        onClick={() => can && setOpen(o => !o)}
        style={{ cursor: can ? "pointer" : "default" }}
        aria-expanded={open}
        disabled={!can}
      >
        <span className="lbl">
          <span>{label}</span>
          {chip && <span className={`chip ${chip.tone}`}>{chip.text}</span>}
        </span>
        <span className="big num">
          {value}
          {valueNote && <span className="bignote mut">{valueNote}</span>}
          {can && <span className={`caret${open ? " open" : ""}`} aria-hidden> ▸</span>}
        </span>
        {rows?.map(r => (
          <span className="row" key={r.k}><span>{r.k}</span><b className="num">{r.v}</b></span>
        ))}
        {net && <span className="net num"><span>{net.k}</span><span>{net.v}</span></span>}
      </button>

      <div className="tile-detail">
        <div className="tile-detail-inner">
          <div className="tile-detail-list">
            {items.map(it => (
              <div className="dline" key={it.nmId}>
                <Photo nmId={it.nmId} />
                <span className="dline-name">
                  <span className="name">{it.title}</span>
                  <span className="code">{it.vendorCode} · {it.nmId}</span>
                </span>
                <span className="dline-num num"><b>{it.count} шт</b><span className="mut">{it.sum}</span></span>
              </div>
            ))}
            {totalSkus > items.length && (
              <div className="dmore mut sm">…и ещё {totalSkus - items.length} товаров — см. вкладку РНП</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
