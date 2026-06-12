// Детерминированные мок-данные MPstats: одинаковые входы → одинаковые «живые» ряды.
// Используются пока нет API-ключа, чтобы модуль работал и UI был осмысленным.
import type { CategorySummary, CompetitorDay, KeywordInfo } from "./client";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
const rnd = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

export function mockCategorySummary(path: string): CategorySummary {
  const r = rnd(hash(path));
  const items = 800 + Math.floor(r() * 12000);
  const itemsWithSales = Math.floor(items * (0.25 + r() * 0.4));
  const avgPrice = 350 + Math.floor(r() * 2200);
  const sales30 = Math.floor(itemsWithSales * (8 + r() * 60));
  return {
    path,
    revenue30: sales30 * avgPrice,
    sales30,
    items,
    itemsWithSales,
    sellers: Math.floor(items * (0.15 + r() * 0.25)),
    avgPrice,
    top10Share: Math.round((15 + r() * 55) * 10) / 10,
  };
}

export function mockCompetitorDays(nmId: number, days: number): CompetitorDay[] {
  const r = rnd(hash(String(nmId)));
  const basePrice = 400 + Math.floor(r() * 2500);
  const baseSales = 3 + Math.floor(r() * 40);
  let balance = 200 + Math.floor(r() * 1500);
  const out: CompetitorDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const weekend = [0, 6].includes(new Date(date).getDay()) ? 1.25 : 1;
    const sales = Math.max(0, Math.round(baseSales * weekend * (0.6 + r() * 0.8)));
    const price = Math.round(basePrice * (0.92 + r() * 0.16));
    balance = Math.max(0, balance - sales + (r() > 0.92 ? 300 : 0));
    out.push({
      date, price, sales, revenue: price * sales, balance,
      rating: Math.round((4.2 + r() * 0.7) * 10) / 10,
      comments: 50 + Math.floor(r() * 3000),
    });
  }
  return out;
}

export function mockKeywordInfo(phrase: string): KeywordInfo {
  const r = rnd(hash(phrase));
  return {
    phrase,
    frequency: 500 + Math.floor(r() * 120000),
    results: 300 + Math.floor(r() * 40000),
  };
}
