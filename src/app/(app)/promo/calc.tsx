"use client";
import { useState } from "react";
import { unitEconomics } from "@/lib/metrics/unit";

const rub = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v) + " ₽";
const pct = (v: number) => (v * 100).toFixed(1) + "%";

// На module-level: объявление внутри рендера пересоздавало компонент и инпут терял фокус (аудит #25)
function NumIn(p: { l: string; v: number; set: (n: number) => void; step?: number }) {
  return (
    <label>{p.l}
      <input type="number" value={p.v} step={p.step ?? 1} onChange={e => p.set(Number(e.target.value))} style={{ width: 110 }} />
    </label>
  );
}

export function PromoCalc() {
  const [price, setPrice] = useState(990);
  const [promoPrice, setPromoPrice] = useState(840);
  const [sebes, setSebes] = useState(210);
  const [commission, setCommission] = useState(23);
  const [logistics, setLogistics] = useState(60);
  const [buyout, setBuyout] = useState(85);
  const [drr, setDrr] = useState(8);

  const calc = (p: number) => unitEconomics({
    price: p, sebesRub: sebes, commissionPct: commission / 100, logisticsRub: logistics,
    buyoutPct: buyout / 100, storagePerUnit: 7, acquiringPct: 0.026, drr: drr / 100,
  });
  const base = calc(price);
  const promo = calc(promoPrice);
  const needUplift = promo.profitAdv > 0 ? base.profitAdv / promo.profitAdv : Infinity;

  return (
    <div className="grid32">
      <div className="grid2">
        {[{ t: "Без акции", e: base, p: price }, { t: "В акции", e: promo, p: promoPrice }].map(({ t, e, p }) => (
          <div className="card" key={t}>
            <h2 style={{ marginTop: 0 }}>{t} — {rub(p)}</h2>
            <div className="ul">
              <div className="li"><span>Комиссия WB ({commission}%)</span><b className="num">−{rub(e.com)}</b></div>
              <div className="li"><span>Логистика на выкуп</span><b className="num">−{rub(e.logEff)}</b></div>
              <div className="li"><span>Эквайринг</span><b className="num">−{rub(e.acq)}</b></div>
              <div className="li"><span>НДС 7/107 + УСН 2%</span><b className="num">−{rub(e.vat + e.incomeTax)}</b></div>
              <div className="li"><span>Себестоимость</span><b className="num">−{rub(sebes)}</b></div>
              <div className="li"><span>Реклама (ДРР {drr}%)</span><b className="num">−{rub(p * drr / 100)}</b></div>
              <div className="li tot"><span>Прибыль с рекламой</span>
                <b className={`num ${e.profitAdv > 0 ? "up" : "dn"}`}>{rub(e.profitAdv)} · {pct(e.margAdv)}</b></div>
            </div>
          </div>
        ))}
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <b>Вердикт:</b>{" "}
          {promo.profitAdv <= 0
            ? <span className="dn">в акции уходим в минус — вход не интересен без снижения себестоимости или ДРР.</span>
            : needUplift <= 1
              ? <span className="up">акционная цена прибыльнее текущей — входить однозначно.</span>
              : <span>для сохранения прибыли продажи должны вырасти в <b>×{needUplift.toFixed(2)}</b> (буст выдачи в акциях обычно ×1.3–2).</span>}
        </div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Параметры</h2>
        <div className="frm" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <NumIn l="Цена сейчас, ₽" v={price} set={setPrice} />
          <NumIn l="Цена в акции, ₽" v={promoPrice} set={setPromoPrice} />
          <NumIn l="Себестоимость, ₽" v={sebes} set={setSebes} />
          <NumIn l="Комиссия, %" v={commission} set={setCommission} step={0.5} />
          <NumIn l="Логистика, ₽" v={logistics} set={setLogistics} />
          <NumIn l="Выкуп, %" v={buyout} set={setBuyout} />
          <NumIn l="ДРР, %" v={drr} set={setDrr} step={0.5} />
        </div>
      </div>
    </div>
  );
}
