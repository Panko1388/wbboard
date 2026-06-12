// Фото-чек (фаза 3, последний пункт меню): фото товара → цена закупки 1688 → вердикт.
// Пайплайн на мок-провайдерах до подключения Vision LLM (OpenRouter) и OTAPI/TMAPI.
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtRub, fmtNum } from "@/lib/format";
import { StageBar } from "@/components/ui";
import { retryPhotoCheck } from "@/app/actions";
import { UploadForm } from "./upload";

export const dynamic = "force-dynamic";

const STAGES = ["В очереди", "Анализ фото", "Поиск 1688", "Готово"];
const stageIdx = (st: string) => ({ QUEUED: 0, ANALYZING: 1, SOURCING: 2, DONE: 3, ERROR: 0 }[st] ?? 0);

export default async function PhotoCheckPage() {
  await requireModule("photocheck");
  const checks = await db.photoCheck.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const mock = process.env.PHOTOCHECK_MOCK !== "0";

  return (
    <>
      <h1>Фото-чек · цена и вердикт по фото</h1>
      <p className="sub">Фото товара → ключи и категория → аналоги WB → закупка на 1688 → «вход интересен при закупке ≤ X ₽»</p>
      {mock && (
        <div className="banner info">
          <b>Мок-режим.</b>&nbsp;Анализ фото и цены 1688 — демонстрационные. Живой пайплайн (Vision LLM через
          OpenRouter + OTAPI/TMAPI) подключается в фазе 3 — установите PHOTOCHECK_MOCK=0 и ключи в env.
        </div>
      )}

      <UploadForm />

      <h2>Проверки</h2>
      {checks.length === 0 && <p className="mut sm">Загрузите первое фото — вердикт появится через несколько секунд.</p>}
      {checks.map(c => (
        <div className="card" key={c.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pimg lg" src={`/api/photocheck/img/${c.id}`} alt="" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <StageBar stages={STAGES} current={stageIdx(c.status)} />
                <span style={{ flex: 1 }} />
                {c.provider === "mock" && <span className="chip mut">мок</span>}
                <span className="sm mut">{c.createdAt.toLocaleString("ru-RU")}</span>
              </div>
              {c.status === "ERROR" && (
                <div className="banner">
                  Ошибка: {c.error}
                  <form action={retryPhotoCheck} style={{ marginLeft: "auto" }}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn" type="submit">Повторить</button>
                  </form>
                </div>
              )}
              {c.status === "DONE" && (
                <>
                  <div className="kpi" style={{ margin: "8px 0" }}>
                    <span className="it"><b>{c.category ?? "—"}</b><span>категория</span></span>
                    <span className="it"><b className="num">{c.wbAvgPrice ? fmtRub(Number(c.wbAvgPrice)) : "—"}</b><span>цена аналогов WB</span></span>
                    <span className="it"><b className="num">{c.bestPriceCny ? `¥ ${fmtNum(Number(c.bestPriceCny), 2)}` : "—"}</b><span>лучшая цена 1688</span></span>
                    <span className="it"><b className="num">{c.bestPriceRub ? fmtRub(Number(c.bestPriceRub)) : "—"}</b><span>закупка с карго, ₽/шт</span></span>
                    <span className="it"><b className="num">{c.maxBuyPriceRub ? `≤ ${fmtRub(Number(c.maxBuyPriceRub))}` : "—"}</b><span>порог входа</span></span>
                  </div>
                  <p style={{ fontWeight: 650 }}>{c.verdict}</p>
                  {c.keywords.length > 0 && (
                    <p className="sm mut" style={{ marginTop: 4 }}>Ключи: {c.keywords.join(" · ")}</p>
                  )}
                  {Array.isArray(c.source1688) && (c.source1688 as { title: string; priceCny: number; minQty: number; url: string }[]).length > 0 && (
                    <div className="ul" style={{ marginTop: 6 }}>
                      {(c.source1688 as { title: string; priceCny: number; minQty: number; url: string }[]).map((o, i) => (
                        <div className="li" key={i}>
                          <span><a href={o.url} target="_blank" rel="noreferrer">{o.title}</a> <span className="sm mut">MOQ {o.minQty}</span></span>
                          <b className="num">¥ {fmtNum(o.priceCny, 2)}</b>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ))}
      <p className="sm mut">
        Допущения вердикта: комиссия 23%, логистика 60 ₽, выкуп 85%, ДРР 10%, целевая маржа 15% — настраиваются в env.
      </p>
    </>
  );
}
