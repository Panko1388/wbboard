// Мониторинг новостей WB API: ищем анонсы изменений/депрекейшнов наших эндпоинтов,
// чтобы узнать о breaking changes ДО того, как сбор молча сломается (риск-аудит R1.5).
import { wbFetch } from "@/lib/wb/client";
import { WB } from "@/lib/wb/endpoints";
import { db } from "@/lib/db";
import { sendTg } from "@/lib/alerts/tg";
import { activeCabinetsWithTokens } from "@/lib/runner";

type NewsItem = { id: number; name?: string; header?: string; date?: string };

const FLAGS = /deprecat|устар|прекра|отключ|измен|новая версия|\bv[2-9]\b|перестан|migrat/i;

export async function collectNews(): Promise<number> {
  const cabs = await activeCabinetsWithTokens();
  const token = cabs[0]?.token;
  if (!token) return 0;

  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const items = await wbFetch<NewsItem[]>({
    cabinetToken: token, url: WB.news, minIntervalMs: 5_000, params: { from },
  });
  if (!Array.isArray(items)) return 0;

  let flagged = 0;
  for (const it of items) {
    const text = `${it.header ?? ""} ${it.name ?? ""}`;
    if (!FLAGS.test(text)) continue;
    const dedup = await db.alert.findFirst({
      where: { type: "wb_news", payload: { path: ["id"], equals: it.id } },
    });
    if (dedup) continue;
    await db.alert.create({
      data: { type: "wb_news", severity: "info", payload: { id: it.id, header: (it.header ?? "").slice(0, 200) } },
    });
    await sendTg(`📣 WB анонс возможного изменения API: <b>${(it.header ?? "новость").slice(0, 200)}</b> — проверьте, не затронуты ли коллекторы`);
    flagged++;
  }
  return items.length;
}
