// Глубокий health: щупаем БД и свежесть ключевого коллектора. 503 при деградации —
// чтобы внешний uptime-монитор видел реальную проблему, а не «ok» при лежащей БД (риск-аудит R3.3).
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const ts = new Date().toISOString();
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return Response.json({ ok: false, db: false, ts }, { status: 503 });
  }
  // свежесть orders: если успешного сбора не было > 6 часов — деградация
  let ordersAgeH: number | null = null;
  try {
    const last = await db.collectorRun.findFirst({
      where: { name: "orders", status: "ok" }, orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    if (last) ordersAgeH = Math.round((Date.now() - last.startedAt.getTime()) / 36e5);
  } catch { /* не валим health из-за этого */ }

  const stale = ordersAgeH !== null && ordersAgeH > 6;
  return Response.json(
    { ok: !stale, db: true, ordersAgeH, ts },
    { status: stale ? 503 : 200 },
  );
}
