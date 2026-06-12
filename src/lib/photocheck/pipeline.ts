// Фото-чек (фаза 3): фото товара → ключи/категория → аналоги на WB → цена закупки 1688
// → вердикт «вход интересен при закупке ≤ X ₽».
// Сейчас: мок-провайдеры (детерминированные). Живые: Vision LLM через OpenRouter
// (llm-gateway, RISK-09) + OTAPI/TMAPI для 1688 — подключаются в этом файле,
// интерфейс не меняется. provider в PhotoCheck помечает источник.
import { db } from "@/lib/db";
import { unitEconomics } from "@/lib/metrics/unit";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
const rnd = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

type AnalyzeResult = { keywords: string[]; category: string; wbAvgPrice: number };
type SourceOffer = { title: string; url: string; priceCny: number; minQty: number };

async function analyzePhoto(checkId: string, _imagePath: string): Promise<AnalyzeResult> {
  if (process.env.PHOTOCHECK_MOCK !== "0") {
    const r = rnd(hash(checkId));
    const cats = [
      ["органайзер для хранения", "Дом/Хранение вещей", 590],
      ["держатель для телефона", "Автотовары/Аксессуары", 450],
      ["лампа настольная", "Дом/Освещение", 1190],
      ["коврик для мыши", "Электроника/Аксессуары", 390],
      ["набор контейнеров", "Кухня/Хранение продуктов", 790],
    ] as const;
    const c = cats[Math.floor(r() * cats.length)];
    return {
      keywords: [c[0], c[0].split(" ")[0], `${c[0]} купить`],
      category: c[1],
      wbAvgPrice: Math.round(Number(c[2]) * (0.85 + r() * 0.4)),
    };
  }
  // TODO live: Vision LLM через OpenRouter (ключ в Integration 'openrouter')
  throw new Error("Live Vision LLM не подключён — установите PHOTOCHECK_MOCK=1");
}

async function source1688(checkId: string, _keywords: string[]): Promise<SourceOffer[]> {
  if (process.env.PHOTOCHECK_MOCK !== "0") {
    const r = rnd(hash(checkId + "1688"));
    const base = 8 + r() * 35;
    return Array.from({ length: 4 }, (_, i) => ({
      title: `1688 поставщик ${i + 1} (мок)`,
      url: `https://detail.1688.com/offer/mock${i}.html`,
      priceCny: Math.round(base * (0.8 + r() * 0.5) * 100) / 100,
      minQty: [2, 10, 50, 100][i] ?? 10,
    })).sort((a, b) => a.priceCny - b.priceCny);
  }
  // TODO live: OTAPI/TMAPI поиск по картинке
  throw new Error("Live 1688 sourcing не подключён — установите PHOTOCHECK_MOCK=1");
}

export async function runPhotoCheck(id: string): Promise<void> {
  const check = await db.photoCheck.findUnique({ where: { id } });
  if (!check || check.status === "DONE") return;
  try {
    await db.photoCheck.update({ where: { id }, data: { status: "ANALYZING" } });
    const a = await analyzePhoto(id, check.imagePath);

    await db.photoCheck.update({
      where: { id },
      data: { status: "SOURCING", keywords: a.keywords, category: a.category, wbAvgPrice: a.wbAvgPrice },
    });
    const offers = await source1688(id, a.keywords);
    const bestCny = offers[0]?.priceCny ?? 0;

    const fx = await db.fxRate.findFirst({ orderBy: { date: "desc" } });
    const cnyRub = Number(fx?.cnyRub ?? 11.5);
    const cargoPerUnit = Number(process.env.PHOTOCHECK_CARGO_RUB ?? 35); // карго ₽/ед, грубая оценка
    const bestRub = Math.round(bestCny * cnyRub + cargoPerUnit);

    // Максимальная закупка, при которой профит ≥ целевой маржи (дефолт 15% с рекламой).
    // Допущения: комиссия 23%, логистика 60 ₽, выкуп 85%, хранение 7 ₽, эквайринг 2.6%, ДРР 10%.
    const targetMarg = Number(process.env.PHOTOCHECK_TARGET_MARG ?? 0.15);
    const price = a.wbAvgPrice;
    let maxBuy = 0;
    for (let sebes = price; sebes >= 0; sebes -= 5) {
      const e = unitEconomics({
        price, sebesRub: sebes, commissionPct: 0.23, logisticsRub: 60, buyoutPct: 0.85,
        storagePerUnit: 7, acquiringPct: 0.026, drr: 0.10,
      });
      if (e.margAdv >= targetMarg) { maxBuy = sebes; break; }
    }

    const interesting = bestRub > 0 && bestRub <= maxBuy;
    const verdict = interesting
      ? `✅ Вход интересен: закупка ~${bestRub} ₽/шт ≤ порога ${maxBuy} ₽ (маржа ≥ ${Math.round(targetMarg * 100)}% при цене WB ~${price} ₽).`
      : `❌ Вход не интересен: закупка ~${bestRub} ₽/шт выше порога ${maxBuy} ₽ (цена WB ~${price} ₽, целевая маржа ${Math.round(targetMarg * 100)}%).`;

    await db.photoCheck.update({
      where: { id },
      data: {
        status: "DONE", source1688: offers as object[], bestPriceCny: bestCny, bestPriceRub: bestRub,
        maxBuyPriceRub: maxBuy, verdict,
        provider: process.env.PHOTOCHECK_MOCK !== "0" ? "mock" : "live",
        finishedAt: new Date(),
      },
    });
  } catch (e) {
    await db.photoCheck.update({
      where: { id },
      data: { status: "ERROR", error: e instanceof Error ? e.message : String(e), finishedAt: new Date() },
    });
  }
}

/** Обработать очередь (вызывается воркером и после загрузки фото) */
export async function processPhotoQueue(): Promise<number> {
  const queued = await db.photoCheck.findMany({ where: { status: "QUEUED" }, take: 10 });
  for (const q of queued) await runPhotoCheck(q.id);
  return queued.length;
}
