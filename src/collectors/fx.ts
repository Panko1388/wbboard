// Курс дня (спека §16). usdRubCbr/cnyRub — ЦБ РФ (cbr-xml-daily). usdRubCash —
// эффективный курс Андре (stbank.by, кросс через BYN): вводится вручную в Настройках
// или парсится позже; алерт при Δ к курсу активных партий ≥ порога.
import { db } from "@/lib/db";

type CbrResp = { Valute?: { USD?: { Value: number }; CNY?: { Value: number; Nominal: number } } };

export async function collectFx(): Promise<number> {
  const resp = await fetch("https://www.cbr-xml-daily.ru/daily_json.js");
  if (!resp.ok) throw new Error(`CBR ${resp.status}`);
  const data = (await resp.json()) as CbrResp;
  const usd = data.Valute?.USD?.Value;
  const cny = data.Valute?.CNY ? data.Valute.CNY.Value / (data.Valute.CNY.Nominal || 1) : undefined;

  const today = new Date(new Date().toISOString().slice(0, 10));
  await db.fxRate.upsert({
    where: { date: today },
    create: { date: today, usdRubCbr: usd ?? null, cnyRub: cny ?? null, source: "cbr" },
    update: { usdRubCbr: usd ?? null, cnyRub: cny ?? null },
  });

  // алерт при отклонении к курсам активных партий
  const threshold = Number(process.env.FX_ALERT_PCT ?? 5);
  if (usd) {
    const batches = await db.cogsBatch.findMany({
      where: { currency: "USD", validTo: null },
      select: { nmId: true, rateAtPurchase: true },
      take: 500,
    });
    for (const b of batches) {
      const delta = (usd / Number(b.rateAtPurchase) - 1) * 100;
      if (Math.abs(delta) >= threshold) {
        // дедуп: не чаще раза в 3 дня на SKU, иначе лента алертов забивается (аудит #20)
        const recent = await db.alert.findFirst({
          where: { type: "fx_delta", nmId: b.nmId, createdAt: { gt: new Date(Date.now() - 3 * 864e5) } },
        });
        if (recent) continue;
        await db.alert.create({
          data: {
            type: "fx_delta", severity: "warn", nmId: b.nmId,
            payload: { rateNow: usd, rateAtPurchase: Number(b.rateAtPurchase), deltaPct: Math.round(delta * 10) / 10 },
          },
        });
      }
    }
  }
  return 1;
}
