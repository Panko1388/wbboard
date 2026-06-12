// Обёртка запуска коллектора: лог в CollectorRun, алерт при ошибке
import { db } from "@/lib/db";
import { sendTg } from "@/lib/alerts/tg";

export async function runCollector(
  name: string,
  cabinetSid: string | null,
  fn: () => Promise<number>, // возвращает кол-во upserted строк
): Promise<{ ok: boolean; rows: number; error?: string }> {
  const run = await db.collectorRun.create({ data: { name, cabinetSid } });
  try {
    const rows = await fn();
    await db.collectorRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "ok", rowsUpserted: rows },
    });
    return { ok: true, rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // «Мягкий пропуск» из-за активного штрафа WB — это НЕ авария: логируем тихо,
    // без алерта и спама в TG (иначе при штрафе каждые 30 мин летит куча ошибок).
    const soft = /штраф активен|пропуск/i.test(msg);
    await db.collectorRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: soft ? "skip" : "error", error: msg.slice(0, 2000) },
    });
    if (!soft) {
      await db.alert.create({
        data: { type: "collector_error", severity: "bad", cabinetSid, payload: { name, error: msg.slice(0, 500) } },
      });
      await sendTg(`❌ Коллектор <b>${name}</b>${cabinetSid ? ` (${cabinetSid})` : ""}: ${msg.slice(0, 300)}`).catch(() => {});
    }
    return { ok: false, rows: 0, error: msg };
  }
}

/** Активные кабинеты с расшифрованным токеном */
export async function activeCabinetsWithTokens() {
  const { decrypt } = await import("@/lib/crypto");
  const cabs = await db.cabinet.findMany({ where: { active: true } });
  const tokens = await db.cabinetToken.findMany({ where: { cabinetSid: { in: cabs.map(c => c.sid) } } });
  return cabs
    .map(c => {
      const t = tokens.find(t => t.cabinetSid === c.sid);
      if (!t) return null;
      try { return { cabinet: c, token: decrypt(t.tokenEnc) }; } catch { return null; }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
