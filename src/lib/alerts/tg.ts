// Telegram-алерты. Без TG_BOT_TOKEN тихо пропускаются (локальная разработка).
export async function sendTg(text: string, chatId = process.env.TG_CHAT_ID_OWNER) {
  if (!process.env.TG_BOT_TOKEN || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("[tg]", e);
  }
}
