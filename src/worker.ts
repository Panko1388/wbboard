// Фоновый воркер: pg-boss. Расписание — research/01-wb-seller-api.md §4.
// Очереди сериализованы по кабинету (per-cabinet token bucket в wb/client).
import PgBoss from "pg-boss";
import { db } from "@/lib/db";
import { runCollector, activeCabinetsWithTokens } from "@/lib/runner";
import { collectOrders } from "@/collectors/orders";
import { collectSales } from "@/collectors/sales";
import { collectStocks } from "@/collectors/stocks";
import { collectFinreport } from "@/collectors/finreport";
import { collectTariffs } from "@/collectors/tariffs";
import { collectAdv } from "@/collectors/adv";
import { collectFunnel } from "@/collectors/funnel";
import { collectFx } from "@/collectors/fx";
import { collectMpstats } from "@/collectors/mpstats";
import { processPhotoQueue } from "@/lib/photocheck/pipeline";
import { sendTg } from "@/lib/alerts/tg";
import { sendDailyReport } from "@/lib/report";
import { pollTgCommands } from "@/lib/tgbot";

type PerCabinet = (sid: string, token: string) => Promise<number>;
const perCabinet: Record<string, PerCabinet> = {
  orders: collectOrders,
  sales: collectSales,
  stocks: collectStocks,
  finreport: collectFinreport,
  tariffs: collectTariffs,
  adv: collectAdv,
  funnel: collectFunnel,
};

const SCHEDULES: [name: string, cron: string][] = [
  ["orders", "*/30 * * * *"],
  ["sales", "*/30 * * * *"],
  ["stocks", "0 7,19 * * *"],
  ["finreport", "0 5 * * *"], // ежедневно 05:00: добивает бэкфилл по 20 стр/раз, не в 09:00 (конфликт с отчётом)
  ["tariffs", "0 6 * * *"],
  ["adv", "5 * * * *"],
  ["funnel", "20 3 * * *"],
  ["fx", "0 10 * * *"],
  ["news", "30 8 * * *"], // мониторинг breaking changes WB (риск-аудит R1.5)
  ["mpstats", "40 5 * * *"], // ниши/конкуренты/ключи
  ["photocheck", "*/2 * * * *"], // очередь фото-чеков
  ["daily_report", "0 9 * * *"], // отчёт за вчера в Telegram, 09:00 МСК
  ["cleanup", "0 4 * * *"], // ретеншн: диск маленького VPS не резиновый (риск-аудит #6)
  ["tg_commands", "* * * * *"], // /diag /report /status в боте — диагностика без консоли
  ["heartbeat", "*/15 * * * *"],
];

async function runJob(name: string) {
  if (perCabinet[name]) {
    const cabs = await activeCabinetsWithTokens();
    if (!cabs.length) console.log(`[worker] ${name}: нет кабинетов с токенами`);
    for (const { cabinet, token } of cabs) {
      const r = await runCollector(name, cabinet.sid, () => perCabinet[name](cabinet.sid, token));
      console.log(`[worker] ${name} ${cabinet.sid}: ${r.ok ? `ok, ${r.rows} строк` : `error: ${r.error}`}`);
    }
    return;
  }
  if (name === "fx") { await runCollector("fx", null, collectFx); return; }
  if (name === "mpstats") { await runCollector("mpstats", null, collectMpstats); return; }
  if (name === "news") {
    const { collectNews } = await import("@/collectors/news");
    await runCollector("news", null, collectNews);
    return;
  }
  if (name === "photocheck") { await processPhotoQueue(); return; }
  if (name === "daily_report") { await sendDailyReport(); return; }
  if (name === "cleanup") { await cleanup(); return; }
  if (name === "tg_commands") { await pollTgCommands(); return; }
  if (name === "heartbeat") { await heartbeat(); return; }
}

// Ретеншн: сырьё 30 дней, журналы 60, отправленные алерты 90, снапшоты остатков 90,
// фото-чеки 60 (история продаж/финотчёта не трогается — она невосстановима).
async function cleanup() {
  const d = (days: number) => new Date(Date.now() - days * 864e5);
  const raw = await db.rawApiResponse.deleteMany({ where: { fetchedAt: { lt: d(30) } } });
  const runs = await db.collectorRun.deleteMany({ where: { startedAt: { lt: d(60) } } });
  const alerts = await db.alert.deleteMany({ where: { createdAt: { lt: d(90) }, sentAt: { not: null } } });
  // StockSnapshot пишется 2 р/день полным срезом — растёт линейно навсегда (риск-аудит R2.2).
  // 90 дней истории остатков достаточно для «дней обеспеченности»; глубже — не нужно.
  const snaps = await db.stockSnapshot.deleteMany({ where: { takenAt: { lt: d(90) } } });
  const photos = await db.photoCheck.deleteMany({ where: { createdAt: { lt: d(60) } } });
  console.log(`[cleanup] raw:${raw.count} runs:${runs.count} alerts:${alerts.count} snaps:${snaps.count} photos:${photos.count}`);
}

// Свежесть: алерт, если ключевые коллекторы молчат дольше порога
const FRESHNESS_H: Record<string, number> = { orders: 2, sales: 2, stocks: 16, adv: 3 };
async function heartbeat() {
  const cabs = await activeCabinetsWithTokens();
  for (const { cabinet } of cabs) {
    for (const [name, maxH] of Object.entries(FRESHNESS_H)) {
      const last = await db.collectorRun.findFirst({
        where: { name, cabinetSid: cabinet.sid, status: "ok" },
        orderBy: { startedAt: "desc" },
      });
      const ageH = last ? (Date.now() - last.startedAt.getTime()) / 36e5 : Infinity;
      if (ageH > maxH) {
        // дедуп с учётом имени коллектора: «orders молчит» не глушит «sales молчит» (аудит #22)
        const recent = await db.alert.findFirst({
          where: {
            type: "collector_silent", cabinetSid: cabinet.sid,
            createdAt: { gt: new Date(Date.now() - 6 * 36e5) },
            payload: { path: ["name"], equals: name },
          },
        });
        if (!recent) {
          await db.alert.create({
            data: { type: "collector_silent", severity: "warn", cabinetSid: cabinet.sid, payload: { name, ageH: Math.round(ageH) } },
          });
          await sendTg(`⚠️ <b>${cabinet.name}</b>: коллектор «${name}» молчит ${Math.round(ageH)} ч`);
        }
      }
    }
  }
  // токены: алерт за 14 дней до истечения
  const tokens = await db.cabinetToken.findMany({ where: { expiresAt: { not: null } } });
  for (const t of tokens) {
    const daysLeft = (t.expiresAt!.getTime() - Date.now()) / 864e5;
    if (daysLeft < 14 && daysLeft > 0) {
      const recent = await db.alert.findFirst({
        where: { type: "token_expiry", cabinetSid: t.cabinetSid, createdAt: { gt: new Date(Date.now() - 5 * 864e5) } },
      });
      if (!recent) {
        await db.alert.create({
          data: { type: "token_expiry", severity: "warn", cabinetSid: t.cabinetSid, payload: { daysLeft: Math.floor(daysLeft) } },
        });
        await sendTg(`🔑 Токен кабинета ${t.cabinetSid} истекает через ${Math.floor(daysLeft)} дн — перевыпустить в ЛК WB`);
      }
    }
  }

  // Расхождение оценки с финотчётом: drift считался, но не алертил (риск-аудит R5.1)
  try {
    const { weeklyDrift } = await import("@/lib/pl");
    const drift = await weeklyDrift([]);
    if (drift && Math.abs(drift.driftPct) > 12) {
      const recent = await db.alert.findFirst({
        where: { type: "finreport_drift", createdAt: { gt: new Date(Date.now() - 3 * 864e5) } },
      });
      if (!recent) {
        await db.alert.create({
          data: { type: "finreport_drift", severity: "warn", payload: { driftPct: Math.round(drift.driftPct * 10) / 10 } },
        });
        await sendTg(`📐 Оценка прибыли разошлась с финотчётом на ${drift.driftPct.toFixed(1)}% за неделю ${drift.weekStart.toLocaleDateString("ru-RU")} — проверьте формулы/комиссии`);
      }
    }
  } catch (e) { console.error("[heartbeat] drift", e); }

  // Контроль места на диске и размера БД (риск-аудит R2.2): тихое переполнение = смерть сбора
  try {
    const sz = await db.$queryRaw<{ gb: number }[]>`SELECT pg_database_size(current_database())::float / 1073741824 gb`;
    const gb = sz[0]?.gb ?? 0;
    if (gb > 8) {
      const recent = await db.alert.findFirst({
        where: { type: "db_size", createdAt: { gt: new Date(Date.now() - 2 * 864e5) } },
      });
      if (!recent) {
        await db.alert.create({ data: { type: "db_size", severity: "warn", payload: { gb: Math.round(gb * 10) / 10 } } });
        await sendTg(`💾 База данных выросла до ${gb.toFixed(1)} ГБ — проверьте свободное место на VPS`);
      }
    }
  } catch (e) { console.error("[heartbeat] dbsize", e); }
}

async function main() {
  const boss = new PgBoss(process.env.DATABASE_URL!);
  boss.on("error", e => console.error("[pg-boss]", e));
  await boss.start();
  for (const [name, cron] of SCHEDULES) {
    // finreport-бэкфилл живёт часами — дефолтный expireIn (~15 мин) убивал бы джоб
    // посреди прогона и плодил повторы (аудит #9)
    // retryLimit 2 с backoff: транзиентные сбои БД/сети самоизлечиваются. Штрафной
    // шлагбаум WB не даст ретраю долбить API под штрафом (риск-аудит R4.3).
    await boss.createQueue(name, {
      name,
      expireInSeconds: name === "finreport" ? 6 * 3600 : 1800,
      retryLimit: 2,
      retryBackoff: true,
    });
    await boss.schedule(name, cron, {}, { tz: "Europe/Moscow" });
    await boss.work(name, async () => runJob(name));
  }
  console.log("WBboard worker started:", SCHEDULES.map(([n]) => n).join(", "));
}
main().catch(e => { console.error(e); process.exit(1); });
