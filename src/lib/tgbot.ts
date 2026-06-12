// Команды Telegram-бота: /diag — ошибки и свежесть коллекторов, /report — отчёт сейчас,
// /status — сводка данных. Воркер поллит getUpdates раз в минуту; отвечает ТОЛЬКО владельцу
// (TG_CHAT_ID_OWNER) — чужие сообщения игнорируются. Offset хранится в Target.
import { db } from "@/lib/db";
import { sendTg } from "@/lib/alerts/tg";

type TgUpdate = {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
};

async function getOffset(): Promise<number> {
  const t = await db.target.findUnique({ where: { key: "tg_update_offset" } });
  const n = typeof t?.value === "number" ? t.value : Number(t?.value);
  return Number.isFinite(n) ? n : 0;
}

async function setOffset(v: number) {
  await db.target.upsert({ where: { key: "tg_update_offset" }, create: { key: "tg_update_offset", value: v }, update: { value: v } });
}

async function buildDiag(): Promise<string> {
  const [errors, summary, fresh, alerts] = await Promise.all([
    db.collectorRun.findMany({
      where: { status: "error" }, orderBy: { id: "desc" }, take: 8,
      select: { name: true, cabinetSid: true, startedAt: true, error: true },
    }),
    db.$queryRaw<{ name: string; status: string; n: number }[]>`
      SELECT name, status, COUNT(*)::int n FROM "CollectorRun"
      WHERE "startedAt" > now() - interval '24 hours' GROUP BY 1,2 ORDER BY 1,2`,
    db.collectorRun.findMany({
      where: { status: "ok" }, orderBy: { startedAt: "desc" }, distinct: ["name"],
      take: 10, select: { name: true, startedAt: true },
    }),
    db.alert.count({ where: { createdAt: { gt: new Date(Date.now() - 864e5) } } }),
  ]);

  let msg = `🩺 <b>Диагностика</b>\n\n<b>Сводка за 24ч:</b>\n`;
  const byName = new Map<string, string[]>();
  for (const s of summary) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name)!.push(`${s.status === "ok" ? "✅" : s.status === "error" ? "❌" : "⏳"}${s.n}`);
  }
  for (const [name, parts] of byName) msg += `${name}: ${parts.join(" ")}\n`;
  msg += `\nАлертов за 24ч: ${alerts}\n`;

  if (errors.length) {
    msg += `\n<b>Последние ошибки:</b>\n`;
    for (const e of errors) {
      const t = e.startedAt.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      msg += `${t} ${e.name}${e.cabinetSid ? `(${e.cabinetSid})` : ""}: ${(e.error ?? "").slice(0, 110)}\n`;
    }
  } else {
    msg += `\nОшибок нет 🎉\n`;
  }

  msg += `\n<b>Последний успех:</b>\n`;
  for (const f of fresh) {
    msg += `${f.name}: ${f.startedAt.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}\n`;
  }
  return msg.slice(0, 3900);
}

async function buildStatus(): Promise<string> {
  const [orders, sales, fin, stocks, products] = await Promise.all([
    db.order.count(), db.sale.count(), db.finreportRow.count(), db.stockSnapshot.count(), db.product.count(),
  ]);
  const lastOrder = await db.order.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  return `📦 <b>Данные в базе</b>\nЗаказы: ${orders}\nПродажи: ${sales}\nСтроки финотчёта: ${fin}\nСнапшоты остатков: ${stocks}\nТоваров: ${products}\nПоследний заказ: ${lastOrder?.date.toLocaleString("ru-RU") ?? "—"}`;
}

export async function pollTgCommands(): Promise<void> {
  const token = process.env.TG_BOT_TOKEN;
  const owner = process.env.TG_CHAT_ID_OWNER;
  if (!token || !owner) return;

  const offset = await getOffset();
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset + 1}&timeout=0&allowed_updates=["message"]`);
  if (!res.ok) return;
  const data = (await res.json()) as { ok: boolean; result?: TgUpdate[] };
  if (!data.ok || !data.result?.length) return;

  // offset двигаем СРАЗУ (до выполнения команд): иначе упавшая команда повторялась бы
  // каждую минуту в течение суток (риск-аудит). Команды обрабатываем уже после коммита offset.
  const maxId = Math.max(offset, ...data.result.map(u => u.update_id));
  await setOffset(maxId);

  for (const u of data.result) {
    const chatId = u.message?.chat.id;
    const text = (u.message?.text ?? "").trim().toLowerCase();
    if (!chatId || String(chatId) !== String(owner)) continue; // только владелец
    try {
      if (text.startsWith("/diag")) {
        await sendTg(await buildDiag());
      } else if (text.startsWith("/report")) {
        const { sendDailyReport } = await import("@/lib/report");
        await sendDailyReport();
      } else if (text.startsWith("/status")) {
        await sendTg(await buildStatus());
      } else if (text.startsWith("/")) {
        await sendTg("Команды: /diag — ошибки и свежесть · /report — отчёт за вчера · /status — сколько данных в базе");
      }
    } catch (e) {
      console.error("[tgbot] команда упала:", e);
      await sendTg("⚠️ Команда не выполнилась — см. логи воркера").catch(() => {});
    }
  }
}
