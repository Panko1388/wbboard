// Период из query (?p=) — общий для всех страниц
import type { Period } from "@/lib/pl";

export type PeriodKey = "today" | "yesterday" | "7d" | "30d" | "month";

export const PERIODS: { key: PeriodKey; label: string; hint: string }[] = [
  { key: "today", label: "Сегодня", hint: "С 00:00 МСК по сейчас" },
  { key: "yesterday", label: "Вчера", hint: "Полные вчерашние сутки" },
  { key: "7d", label: "7 дней", hint: "Скользящие: последние 7 дней включая сегодня" },
  { key: "30d", label: "30 дней", hint: "Скользящие: последние 30 дней включая сегодня" },
  { key: "month", label: "Месяц", hint: "Календарный: с 1-го числа текущего месяца" },
];

const valid = (p?: string) => PERIODS.some(x => x.key === p);

/** Период: ?p= из URL, иначе дефолт страницы (по умолчанию «Сегодня»).
 *  НЕ запоминаем выбор между страницами — при переходе всегда дефолт (просьба Андре). */
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
    case "30d": return { key, period: { from: new Date(today.getTime() - 29 * 864e5), to: tomorrow } };
    case "month": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { key, period: { from, to: tomorrow } };
    }
  }
}
