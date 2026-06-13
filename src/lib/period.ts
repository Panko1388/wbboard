// Период из query (?p=) — общий для всех страниц
import type { Period } from "@/lib/pl";

export type PeriodKey = "today" | "yesterday" | "7d" | "month" | "lastMonth";

export const PERIODS: { key: PeriodKey; label: string; hint: string }[] = [
  { key: "today", label: "Сегодня", hint: "С 00:00 МСК по сейчас" },
  { key: "yesterday", label: "Вчера", hint: "Полные вчерашние сутки" },
  { key: "7d", label: "7 дней", hint: "Последние 7 дней включая сегодня" },
  { key: "month", label: "Текущий месяц", hint: "С 1-го числа этого месяца по сегодня включительно" },
  { key: "lastMonth", label: "Прошлый месяц", hint: "Весь предыдущий календарный месяц" },
];

const valid = (p?: string) => PERIODS.some(x => x.key === p);

/** ЕДИНАЯ логика периода для всего сайта:
 *  период берётся ТОЛЬКО из ?p= текущей страницы; нет ?p= → всегда «Сегодня».
 *  Выбор живёт лишь в URL этой страницы и НЕ переносится между вкладками (просьба Андре:
 *  любой переход по меню = чистое «Сегодня»). Параметр fallback оставлен на крайний случай,
 *  но по умолчанию для всех страниц — «today». */
export function resolvePeriod(p?: string, fallback: PeriodKey = "today"): { key: PeriodKey; period: Period } {
  const key = (valid(p) ? p : fallback) as PeriodKey;
  // «Сегодня» считаем по МСК (UTC+3): иначе с 00:00 до 03:00 МСК показывался вчерашний день (аудит #11).
  // ИНВАРИАНТ: даты WB (МСК-стенка) хранятся «как UTC» — контейнеры обязаны жить в TZ=UTC.
  const today = new Date(new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10));
  const tomorrow = new Date(today.getTime() + 864e5);
  switch (key) {
    case "today": return { key, period: { from: today, to: tomorrow } };
    case "yesterday": return { key, period: { from: new Date(today.getTime() - 864e5), to: today } };
    case "7d": return { key, period: { from: new Date(today.getTime() - 6 * 864e5), to: tomorrow } };
    case "month": {
      // Текущий месяц: с 1-го числа включительно по сегодня (to=tomorrow, т.к. верхняя граница исключающая)
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { key, period: { from, to: tomorrow } };
    }
    case "lastMonth": {
      // Прошлый месяц: весь предыдущий календарный месяц (1-е прошлого … 1-е текущего, исключая)
      const curMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      return { key, period: { from, to: curMonthStart } };
    }
  }
}
