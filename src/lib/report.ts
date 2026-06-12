// Ежедневный отчёт в Telegram (формат Андре: план/факт + прогноз + все SKU по прибыли).
// Планы задаются в Настройках (Target: plan_orders_day / plan_buyouts_day / plan_profit_day).
import { db } from "@/lib/db";
import { pulseTotals, skuTable } from "@/lib/pl";
import { sendTg } from "@/lib/alerts/tg";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(v)) + "р.";
const pct1 = (v: number) => (v * 100).toFixed(2).replace(".", ",") + "%";
const delta = (cur: number, prev: number) =>
  prev > 0 || cur > 0 ? ` (${cur - prev >= 0 ? "+" : "−"}${Math.abs((cur - prev) * 100).toFixed(2).replace(".", ",")}%)` : "";
const dot = (plan: number | null, fact: number) => (plan == null ? "" : fact >= plan ? "  🟢" : "  🔴");
const planFact = (plan: number | null, fact: number) =>
  `${plan == null ? "—" : r(plan)} / ${r(fact)}${dot(plan, fact)}`;

// Планы задаются НА МЕСЯЦ (Настройки → Планы на месяц); дневная норма и темп считаются сами
async function getPlans(): Promise<{ orders: number | null; buyouts: number | null; profit: number | null }> {
  const keys = ["plan_orders_month", "plan_buyouts_month", "plan_profit_month"];
  const rows = await db.target.findMany({ where: { key: { in: keys } } });
  const val = (k: string) => {
    const v = rows.find(x => x.key === k)?.value;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return { orders: val("plan_orders_month"), buyouts: val("plan_buyouts_month"), profit: val("plan_profit_month") };
}

const rShort = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(v));

export async function buildDailyReport(): Promise<string[]> {
  // дни по МСК
  const mskToday = new Date(new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10));
  const y1 = { from: new Date(mskToday.getTime() - 864e5), to: mskToday };          // вчера
  const y2 = { from: new Date(mskToday.getTime() - 2 * 864e5), to: y1.from };        // позавчера
  const tNow = { from: mskToday, to: new Date(mskToday.getTime() + 864e5) };         // сегодня (для прогноза)

  // месяц «вчерашнего» дня: с 1-го числа по вчера включительно — для темпа выполнения
  const y = y1.from;
  const monthStart = new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), 1));
  const daysInMonth = new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth() + 1, 0)).getUTCDate();
  const daysPassed = y.getUTCDate(); // полных дней с начала месяца (по вчера)
  const monthName = y.toLocaleDateString("ru-RU", { month: "long" });

  const [t1, t2, today, mtd, plans, sku] = await Promise.all([
    pulseTotals(y1, []), pulseTotals(y2, []), pulseTotals(tNow, []),
    pulseTotals({ from: monthStart, to: mskToday }, []), getPlans(), skuTable(y1, []),
  ]);
  const dateStr = y1.from.toLocaleDateString("ru-RU");

  if (t1.ordersCount === 0 && t1.buyoutsCount === 0) {
    return [`📃 <b>Отчёт за ${dateStr}</b>\n\nДанных за вчера нет (коллекторы ещё наполняют историю или продаж не было).\nhttps://wboard.online`];
  }

  // дневная норма из месячного плана
  const norm = (m: number | null) => (m == null ? null : m / daysInMonth);

  // прогноз прибыли на сегодня: экстраполяция по прошедшей доле дня.
  // Утром (< 6ч с начала суток) данных мало — не экстраполируем шум в ×4 убыток (риск-аудит),
  // показываем факт по факту; и не уводим прогноз ниже текущего факта.
  const mskHours = (Date.now() + 3 * 36e5 - mskToday.getTime()) / 36e5;
  const forecast = mskHours < 6
    ? today.profit
    : Math.max(today.profit, today.profit / Math.min(1, mskHours / 24));
  const todayStr = new Date(Date.now() + 3 * 36e5).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });

  const buyoutRate1 = t1.ordersCount ? t1.buyoutsCount / t1.ordersCount : 0;
  const buyoutRate2 = t2.ordersCount ? t2.buyoutsCount / t2.ordersCount : 0;
  const active = sku.filter(s => s.ordersCount > 0 || s.buyoutsCount > 0);

  let head = `📃 <b>Отчёт за ${dateStr}</b>\n\n`;
  head += `Норма дня    /    Факт\n`;
  head += `🛒 Заказы:\n${planFact(norm(plans.orders), t1.ordersSum)}\n`;
  head += `🤝 Выкупы:\n${planFact(norm(plans.buyouts), t1.buyoutsSum)}\n`;
  head += `💵 Прибыль:\n${planFact(norm(plans.profit), t1.profit)}\n\n`;
  head += `Прогноз Прибыль ${todayStr}\n${planFact(norm(plans.profit), forecast)}\n\n`;

  // ── выполнение МЕСЯЧНОГО плана текущим темпом ──
  const monthLine = (label: string, plan: number | null, factMtd: number) => {
    if (plan == null) return "";
    const pace = daysPassed > 0 ? factMtd / daysPassed : 0;
    const forecastMonth = pace * daysInMonth;
    const donePct = Math.round((factMtd / plan) * 100);
    const fcPct = Math.round((forecastMonth / plan) * 100);
    return `${label} ${rShort(factMtd)} из ${rShort(plan)}р. (${donePct}%)\n` +
      `   темпом ${rShort(pace)}р./день → ${rShort(forecastMonth)}р. = ${fcPct}% плана${forecastMonth >= plan ? "  🟢" : "  🔴"}\n`;
  };
  const monthBlock =
    monthLine("🛒", plans.orders, mtd.ordersSum) +
    monthLine("🤝", plans.buyouts, mtd.buyoutsSum) +
    monthLine("💵", plans.profit, mtd.profit);
  if (monthBlock) {
    head += `📅 <b>План на ${monthName} (день ${daysPassed} из ${daysInMonth}):</b>\n${monthBlock}\n`;
  }

  head += `Рабочих SKU: ${active.length}\n`;
  head += `ДРР: ${pct1(t1.drr)}${delta(t1.drr, t2.drr)}\n`;
  head += `Выкуп: ${pct1(buyoutRate1)}${delta(buyoutRate1, buyoutRate2)}\n\n`;
  if (plans.orders == null && plans.buyouts == null && plans.profit == null) {
    head += `<i>Планы не заданы — Настройки → Планы на месяц</i>\n\n`;
  }

  // ВСЕ позиции по прибыли (просьба Андре), убыточные — в конце со знаком −
  let body = `🏆 <b>По Прибыли (все позиции):</b>\n`;
  const lines = [...active]
    .sort((a, b) => b.profit - a.profit)
    .map(s => `${esc(s.vendorCode || s.title)} — ${s.profit < 0 ? "−" : ""}${r(Math.abs(s.profit))}`);
  body += lines.join("\n");
  body += `\n\nhttps://wboard.online`;

  // Telegram режет на 4096 — бьём по строкам с запасом
  const full = head + body;
  if (full.length <= 3900) return [full];
  const out: string[] = [];
  let cur = head;
  for (const line of (`🏆 <b>По Прибыли (все позиции):</b>\n` + lines.join("\n")).split("\n")) {
    if (cur.length + line.length + 1 > 3900) { out.push(cur); cur = ""; }
    cur += (cur ? "\n" : "") + line;
  }
  cur += `\n\nhttps://wboard.online`;
  out.push(cur);
  return out;
}

export async function sendDailyReport(): Promise<string> {
  const parts = await buildDailyReport();
  for (const p of parts) await sendTg(p);
  return parts.join("\n— — —\n");
}
