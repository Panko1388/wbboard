// Отправить отчёт за вчера прямо сейчас (тест TG-настройки): npx tsx scripts/report-now.ts
import { sendDailyReport } from "../src/lib/report";

sendDailyReport()
  .then(msg => { console.log("Отправлено в Telegram:\n\n" + msg.replace(/<[^>]+>/g, "")); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
