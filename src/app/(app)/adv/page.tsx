// Реклама: кампании, расход, ДРР по SKU
import { cookies } from "next/headers";
import { requireModule, cabinetScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolvePeriod } from "@/lib/period";
import { fmtRub, fmtNum, fmtPct } from "@/lib/format";
import { PeriodSeg } from "@/components/PeriodSeg";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdvPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requireModule("adv");
  const { p } = await searchParams;
  const { key, period } = resolvePeriod(p, "today");
  const cab = cabinetScope(user, (await cookies()).get("wbboard_cab")?.value);
  const cabWhere = cab.length ? { cabinetSid: { in: cab } } : {};

  const byCampaign = await db.advDaily.groupBy({
    by: ["campaignId", "campaignType"],
    where: { ...cabWhere, date: { gte: period.from, lt: period.to } },
    _sum: { spend: true, views: true, clicks: true, ordersRub: true },
  });

  const total = byCampaign.reduce((s, c) => s + Number(c._sum.spend ?? 0), 0);
  const ordersRub = byCampaign.reduce((s, c) => s + Number(c._sum.ordersRub ?? 0), 0);

  return (
    <>
      <h1>Реклама и кластеры</h1>
      <p className="sub">Кампании WB Продвижение · расход {fmtRub(total)} · заказы с рекламы {fmtRub(ordersRub)}</p>
      <PeriodSeg base="/adv" current={key} />
      {byCampaign.length === 0 ? (
        <Empty title="Рекламных данных нет" hint="Коллектор adv собирает fullstats v3 ежечасно при наличии токена со скоупом «Продвижение»" />
      ) : (
        <div className="tblwrap">
          <table>
            <thead>
              <tr><th>Кампания</th><th>Тип</th><th>Показы</th><th>Клики</th><th>CTR</th><th>Расход</th><th>Заказы ₽</th><th>ДРР</th></tr>
            </thead>
            <tbody>
              {byCampaign
                .sort((a, b) => Number(b._sum.spend ?? 0) - Number(a._sum.spend ?? 0))
                .map(c => {
                  const spend = Number(c._sum.spend ?? 0);
                  const oRub = Number(c._sum.ordersRub ?? 0);
                  const views = c._sum.views ?? 0;
                  const clicks = c._sum.clicks ?? 0;
                  const drr = oRub ? spend / oRub : 0;
                  return (
                    <tr key={String(c.campaignId)}>
                      <td className="name num">{String(c.campaignId)}</td>
                      <td>{c.campaignType === "auto" ? "Авто" : c.campaignType === "search-catalog" ? "Поиск+каталог" : c.campaignType ?? "—"}</td>
                      <td className="num">{fmtNum(views)}</td>
                      <td className="num">{fmtNum(clicks)}</td>
                      <td className="num">{views ? fmtPct(clicks / views, 2) : "—"}</td>
                      <td className="num">{fmtRub(spend)}</td>
                      <td className="num">{fmtRub(oRub)}</td>
                      <td className="num">
                        {oRub ? <span className={`chip ${drr > 0.15 ? "bad" : drr > 0.1 ? "warn" : "ok"}`}>{fmtPct(drr)}</span> : <span className="chip mut">—</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      <p className="sm mut" style={{ marginTop: 8 }}>
        Кластеры запросов «Джема» и позиции — добавим после накопления search-queries (коллектор funnel).
      </p>
    </>
  );
}
