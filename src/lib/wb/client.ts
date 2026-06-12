// Клиент WB API. Статистика (statistics-api: orders/sales/stocks/finreport) делит
// ОБЩИЙ лимит «Базовых» токенов между кабинетами. Поэтому:
//  1) ВСЕ вызовы статистики строго сериализуются (один за раз, ≥65с) — без залпов;
//  2) при 429 включается «штрафной шлагбаум» (penaltyUntil, persist в Target): пока
//     штраф активен, к WB не ходим вообще — иначе WB продлевает наказание (фикс 429-спирали).
// adv/funnel/storage — на других хостах со своими лимитами, под шлагбаум не попадают.
import { db } from "@/lib/db";

const lastCall = new Map<string, number>();
// кэш штрафа с TTL: перечитываем из БД ≤30с, чтобы (а) веб-процесс видел штраф воркера
// (ручной «Собрать сейчас» не должен идти мимо штрафа — аудит R1.1), (б) можно было
// досрочно снять штраф правкой в БД, (в) истёкший штраф подхватывался.
const penaltyMem = new Map<string, { v: number; at: number }>();
const PENALTY_TTL = 30_000;
let statsChain: Promise<unknown> = Promise.resolve();

const isStats = (host: string) => host.includes("statistics-api");

async function getPenalty(host: string): Promise<number> {
  const c = penaltyMem.get(host);
  if (c && Date.now() - c.at < PENALTY_TTL) return c.v;
  let v = c?.v ?? 0;
  try {
    const t = await db.target.findUnique({ where: { key: `wb_penalty_${host}` } });
    v = Number(t?.value) || 0;
  } catch { /* БД недоступна — оставляем прежнее значение */ }
  penaltyMem.set(host, { v, at: Date.now() });
  return v;
}

async function setPenalty(host: string, until: number) {
  penaltyMem.set(host, { v: until, at: Date.now() });
  try {
    await db.target.upsert({
      where: { key: `wb_penalty_${host}` },
      create: { key: `wb_penalty_${host}`, value: until },
      update: { value: until },
    });
  } catch { /* не критично */ }
}

async function space(host: string, minMs: number) {
  const key = isStats(host) ? "statistics" : host; // вся статистика — один слот
  const wait = (lastCall.get(key) ?? 0) + minMs - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall.set(key, Date.now());
}

async function doFetch<T>(url: URL, init: RequestInit, host: string): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 429) {
    const retry = Number(res.headers.get("X-Ratelimit-Retry") ?? 60);
    await setPenalty(host, Date.now() + (retry + 10) * 1000);
    throw new Error(`WB 429: штраф ${retry}s — пауза до истечения (не долбимся, иначе продлится)`);
  }
  if (res.status === 409) throw new Error(`WB 409 (не ретраим): ${(await res.text()).slice(0, 200)}`);
  if (!res.ok) throw new Error(`WB ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

async function call<T>(url: URL, init: RequestInit, minMs: number): Promise<T> {
  const host = url.host;
  // штрафной шлагбаум — для ЛЮБОГО хоста WB (advert/common тоже ловят 429):
  // пока активен штраф этого хоста, не ходим к нему вовсе
  const left = (await getPenalty(host)) - Date.now();
  if (left > 0) throw new Error(`WB штраф активен — пропуск, ещё ${Math.ceil(left / 1000)}s`);
  await space(host, minMs);
  return doFetch<T>(url, init, host);
}

// Сериализатор: статистика идёт строго по очереди (склеиваем в цепочку промисов).
function serialize<T>(host: string, fn: () => Promise<T>): Promise<T> {
  if (!isStats(host)) return fn();
  const run = statsChain.then(fn, fn);
  statsChain = run.then(() => {}, () => {});
  return run;
}

export async function wbFetch<T>(opts: {
  cabinetToken: string;
  url: string;
  minIntervalMs?: number;
  params?: Record<string, string>;
}): Promise<T> {
  const url = new URL(opts.url);
  Object.entries(opts.params ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const min = isStats(url.host) ? Math.max(opts.minIntervalMs ?? 65000, 65000) : (opts.minIntervalMs ?? 60000);
  return serialize(url.host, () => call<T>(url, { headers: { Authorization: opts.cabinetToken } }, min));
}

export async function wbPost<T>(opts: {
  cabinetToken: string;
  url: string;
  minIntervalMs?: number;
  body: unknown;
}): Promise<T> {
  const url = new URL(opts.url);
  const min = isStats(url.host) ? Math.max(opts.minIntervalMs ?? 65000, 65000) : (opts.minIntervalMs ?? 60000);
  return serialize(url.host, () => call<T>(url, {
    method: "POST",
    headers: { Authorization: opts.cabinetToken, "Content-Type": "application/json" },
    body: JSON.stringify(opts.body),
  }, min));
}
