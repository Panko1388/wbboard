// Клиент MPstats API (https://mpstats.io/api — раздел WB).
// Токен: Настройки → Интеграции (шифруется в БД) или env MPSTATS_TOKEN.
// Без токена или при MPSTATS_MOCK=1 работает мок-режим (детерминированные данные),
// чтобы команда видела живой модуль до покупки подписки.
//
// ВАЖНО: при покупке ключа сверить пути/поля с актуальной документацией MPstats —
// все обращения к API изолированы в этом файле.
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { mockCategorySummary, mockCompetitorDays, mockKeywordInfo } from "./mock";

const BASE = "https://mpstats.io/api/wb/get";

export type CategorySummary = {
  path: string; revenue30: number; sales30: number; items: number;
  itemsWithSales: number; sellers: number; avgPrice: number; top10Share: number;
};
export type CompetitorDay = {
  date: string; price: number | null; sales: number | null;
  revenue: number | null; balance: number | null; rating: number | null; comments: number | null;
};
export type KeywordInfo = { phrase: string; frequency: number; results: number };
export type CompetitorCard = { nmId: number; title?: string; brand?: string; category?: string; photoUrl?: string };

async function getToken(): Promise<string | null> {
  if (process.env.MPSTATS_MOCK === "1") return null;
  const row = await db.integration.findUnique({ where: { key: "mpstats" } });
  if (row?.tokenEnc && row.active) {
    try { return decrypt(row.tokenEnc); } catch { return null; }
  }
  return process.env.MPSTATS_TOKEN || null;
}

export async function mpstatsMode(): Promise<"live" | "mock"> {
  return (await getToken()) ? "live" : "mock";
}

async function mpGet<T>(path: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path);
  Object.entries(params ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { "X-Mpstats-TOKEN": token, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`MPstats ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

/** Сводка ниши/категории за 30 дней */
export async function fetchCategorySummary(path: string): Promise<CategorySummary> {
  const token = await getToken();
  if (!token) return mockCategorySummary(path);

  const d2 = new Date().toISOString().slice(0, 10);
  const d1 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  // GET /category — список карточек категории; агрегируем сами
  type Item = { id: number; revenue?: number; sales?: number; final_price?: number; seller?: string };
  const data = await mpGet<{ data?: Item[]; total?: number }>("/category", token, { path, d1, d2 });
  const items = data.data ?? [];
  const withSales = items.filter(i => (i.sales ?? 0) > 0);
  const revenue = items.reduce((s, i) => s + (i.revenue ?? 0), 0);
  const top10 = [...items].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0)).slice(0, 10)
    .reduce((s, i) => s + (i.revenue ?? 0), 0);
  return {
    path,
    revenue30: revenue,
    sales30: items.reduce((s, i) => s + (i.sales ?? 0), 0),
    items: data.total ?? items.length,
    itemsWithSales: withSales.length,
    sellers: new Set(items.map(i => i.seller).filter(Boolean)).size,
    avgPrice: withSales.length ? withSales.reduce((s, i) => s + (i.final_price ?? 0), 0) / withSales.length : 0,
    top10Share: revenue ? Math.round((top10 / revenue) * 1000) / 10 : 0,
  };
}

/** Продажи/цена/остатки чужой карточки по дням */
export async function fetchCompetitorDays(nmId: number, days = 30): Promise<CompetitorDay[]> {
  const token = await getToken();
  if (!token) return mockCompetitorDays(nmId, days);

  const d2 = new Date().toISOString().slice(0, 10);
  const d1 = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  type Row = { data: string; sales?: number; balance?: number; final_price?: number; rating?: number; comments?: number };
  const rows = await mpGet<Row[]>(`/item/${nmId}/sales`, token, { d1, d2 });
  return (rows ?? []).map(r => ({
    date: r.data,
    price: r.final_price ?? null,
    sales: r.sales ?? null,
    revenue: r.final_price && r.sales ? r.final_price * r.sales : null,
    balance: r.balance ?? null,
    rating: r.rating ?? null,
    comments: r.comments ?? null,
  }));
}

/** Карточка конкурента (название/бренд/категория) */
export async function fetchCompetitorCard(nmId: number): Promise<CompetitorCard> {
  const token = await getToken();
  if (!token) {
    return { nmId, title: `Товар конкурента ${nmId}`, brand: "—", category: "Без категории (мок)" };
  }
  type Card = { item?: { name?: string; brand?: string; category?: string; photos?: string[] } };
  const card = await mpGet<Card>(`/item/${nmId}`, token);
  return {
    nmId,
    title: card.item?.name,
    brand: card.item?.brand,
    category: card.item?.category,
    photoUrl: card.item?.photos?.[0],
  };
}

/** Частотность и размер выдачи по фразе */
export async function fetchKeywordInfo(phrase: string): Promise<KeywordInfo> {
  const token = await getToken();
  if (!token) return mockKeywordInfo(phrase);

  type Resp = { result?: { count?: number; total?: number } };
  const r = await mpGet<Resp>("/keyword", token, { keyword: phrase });
  return { phrase, frequency: r.result?.count ?? 0, results: r.result?.total ?? 0 };
}
