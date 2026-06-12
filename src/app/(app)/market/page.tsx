// Аналитика рынка (MPstats): ниши/категории, конкуренты, ключевые слова.
// Без API-ключа работает мок-режим — структура и UI идентичны живым данным.
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { mpstatsMode } from "@/lib/mpstats/client";
import { fmtNum, fmtRub, fmtPct } from "@/lib/format";
import { Tabs, Empty, Pimg } from "@/components/ui";
import { DoodleScope } from "@/components/doodles";
import { CompetitorChart, KeywordChart } from "@/components/charts";
import { addCompetitor, removeCompetitor, addKeyword, addCategory, refreshMarketNow } from "@/app/actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "niches", label: "Ниши и категории" },
  { key: "comp", label: "Конкуренты" },
  { key: "kw", label: "Ключевые слова" },
];

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireModule("market");
  const { tab = "niches" } = await searchParams;
  const mode = await mpstatsMode();

  return (
    <>
      <h1>Аналитика рынка · MPstats</h1>
      <p className="sub">Внешние данные: ниши, чужие карточки, частотность запросов</p>
      {mode === "mock" && (
        <div className="banner info">
          <b>Мок-режим.</b>&nbsp;Данные демонстрационные (детерминированные). Вставьте API-ключ MPstats в
          «Настройки → Интеграции» — модуль переключится на живые данные без изменений в коде.
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Tabs base="/market" items={TABS} current={tab} />
        <form action={refreshMarketNow} style={{ marginLeft: "auto" }}>
          <button className="btn" type="submit">Обновить данные сейчас</button>
        </form>
      </div>
      {tab === "niches" && <Niches />}
      {tab === "comp" && <Competitors />}
      {tab === "kw" && <Keywords />}
    </>
  );
}

// ── Ниши ─────────────────────────────────────────────
async function Niches() {
  const t = await db.target.findUnique({ where: { key: "mp_categories" } });
  const paths: string[] = Array.isArray(t?.value) ? (t!.value as string[]) : [];
  const today = await db.mpCategorySnapshot.findMany({
    where: { path: { in: paths } }, orderBy: { date: "desc" }, take: paths.length * 2,
  });
  const latest = paths.map(p => today.find(s => s.path === p)).filter(Boolean);

  return (
    <div className="grid32">
      <div>
        {latest.length === 0
          ? <Empty art={<DoodleScope />} title="Ниши не отслеживаются" hint="Добавьте путь категории WB справа (как в MPstats: «Дом/Хранение вещей») и нажмите «Обновить данные сейчас»" />
          : (
            <div className="tblwrap">
              <table>
                <thead>
                  <tr>
                    <th>Ниша</th><th>Выручка 30д</th><th>Продажи 30д</th><th>Карточек</th>
                    <th>% с продажами</th><th>Продавцов</th><th>Ср. цена</th><th>Топ-10 доля</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map(sn => {
                    const withSalesPct = sn!.items ? (sn!.itemsWithSales ?? 0) / sn!.items : 0;
                    const mono = Number(sn!.top10Share ?? 0);
                    return (
                      <tr key={sn!.path}>
                        <td className="name">{sn!.path}</td>
                        <td className="num">{fmtRub(Number(sn!.revenue30 ?? 0))}</td>
                        <td className="num">{fmtNum(sn!.sales30 ?? 0)}</td>
                        <td className="num">{fmtNum(sn!.items ?? 0)}</td>
                        <td className="num">
                          <span className={`chip ${withSalesPct > 0.5 ? "ok" : withSalesPct > 0.3 ? "warn" : "bad"}`}>{fmtPct(withSalesPct, 0)}</span>
                        </td>
                        <td className="num">{fmtNum(sn!.sellers ?? 0)}</td>
                        <td className="num">{fmtRub(Number(sn!.avgPrice ?? 0))}</td>
                        <td className="num">
                          <span className={`chip ${mono < 30 ? "ok" : mono < 55 ? "warn" : "bad"}`}>{fmtNum(mono, 1)}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        <p className="sm mut" style={{ marginTop: 8 }}>
          Зелёный «% с продажами» (&gt;50%) и низкая доля топ-10 (&lt;30%) — признаки живой ниши без монополии.
        </p>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Добавить нишу</h2>
        <form action={addCategory} className="frm" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>Путь категории WB<input type="text" name="path" placeholder="Дом/Хранение вещей" required /></label>
          <button className="btn acc" type="submit">Отслеживать</button>
        </form>
        <p className="sm mut" style={{ marginTop: 8 }}>Все категории кроме одежды и обуви (профиль поиска из концепции).</p>
      </div>
    </div>
  );
}

// ── Конкуренты ───────────────────────────────────────
async function Competitors() {
  const comps = await db.mpCompetitor.findMany({
    where: { active: true },
    include: { snapshots: { orderBy: { date: "asc" }, take: 60 } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="grid32">
      <div>
        {comps.length === 0 && <Empty art={<DoodleScope />} title="Конкуренты не отслеживаются" hint="Добавьте артикул WB конкурента справа — соберём продажи, цену и остатки по дням" />}
        {comps.map(c => {
          const last = c.snapshots[c.snapshots.length - 1];
          const sum30 = c.snapshots.slice(-30).reduce((s, d) => s + Number(d.revenue ?? 0), 0);
          return (
            <div className="card" key={c.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <Pimg url={c.photoUrl} nmId={c.nmId} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="name">{c.title ?? String(c.nmId)}</div>
                  <div className="code">{c.brand ?? "—"} · {String(c.nmId)} · {c.category ?? ""}</div>
                </div>
                {last?.price != null && <span className="chip mut num">цена {fmtRub(Number(last.price))}</span>}
                {last?.balance != null && <span className={`chip ${Number(last.balance) < 50 ? "warn" : "ok"} num`}>остаток {fmtNum(Number(last.balance))}</span>}
                <span className="chip acc num">выручка 30д ≈ {fmtRub(sum30)}</span>
                <form action={removeCompetitor}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn" type="submit">Убрать</button>
                </form>
              </div>
              {c.snapshots.length > 0 ? (
                <CompetitorChart data={c.snapshots.map(d => ({
                  date: d.date.toISOString().slice(0, 10),
                  sales: d.sales, price: d.price == null ? null : Number(d.price),
                  balance: d.balance,
                }))} />
              ) : <p className="mut sm">Данные появятся после ближайшего сбора (или нажмите «Обновить данные сейчас»).</p>}
            </div>
          );
        })}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Добавить конкурента</h2>
        <form action={addCompetitor} className="frm" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>Артикул WB (nmId)<input type="text" name="nmId" placeholder="178402341" required /></label>
          <button className="btn acc" type="submit">Отслеживать</button>
        </form>
        <p className="sm mut" style={{ marginTop: 8 }}>
          Карточка подтянется из MPstats. Ежедневно собираем: продажи шт, цену, остатки, рейтинг.
        </p>
      </div>
    </div>
  );
}

// ── Ключевые слова ───────────────────────────────────
async function Keywords() {
  const kws = await db.mpKeyword.findMany({
    where: { active: true },
    include: { stats: { orderBy: { date: "asc" }, take: 60 } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="grid32">
      <div>
        {kws.length === 0 && <Empty title="Фразы не отслеживаются" hint="Добавьте ключевую фразу справа — соберём частотность WB по дням" />}
        {kws.map(k => {
          const last = k.stats[k.stats.length - 1];
          return (
            <div className="card" key={k.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <b>«{k.phrase}»</b>
                {last?.frequency != null && <span className="chip acc num">{fmtNum(last.frequency)} запр/мес</span>}
                {last?.results != null && <span className="chip mut num">{fmtNum(last.results)} карточек в выдаче</span>}
              </div>
              {k.stats.length > 0 && (
                <KeywordChart data={k.stats.map(d => ({ date: d.date.toISOString().slice(0, 10), frequency: d.frequency }))} />
              )}
            </div>
          );
        })}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Добавить фразу</h2>
        <form action={addKeyword} className="frm" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>Ключевая фраза<input type="text" name="phrase" placeholder="органайзер для хранения" required /></label>
          <button className="btn acc" type="submit">Отслеживать</button>
        </form>
        <p className="sm mut" style={{ marginTop: 8 }}>
          Частотность своих ключей уже даёт «Джем» (страница Реклама) — здесь смотрим чужие/новые ниши.
        </p>
      </div>
    </div>
  );
}
