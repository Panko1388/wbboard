// Первичный сбор после деплоя: тарифы → остатки → заказы → продажи → реклама → курс → финотчёт.
// Кабинеты последовательно («Базовые» токены делят общий лимит). Запускается в фоне, ~10-30 мин.
import { runCollector, activeCabinetsWithTokens } from "../src/lib/runner";
import { collectTariffs } from "../src/collectors/tariffs";
import { collectStocks } from "../src/collectors/stocks";
import { collectOrders } from "../src/collectors/orders";
import { collectSales } from "../src/collectors/sales";
import { collectAdv } from "../src/collectors/adv";
import { collectFinreport } from "../src/collectors/finreport";
import { collectFx } from "../src/collectors/fx";

async function main() {
  const cabs = await activeCabinetsWithTokens();
  console.log(`Кабинетов с токенами: ${cabs.length}`);
  await runCollector("fx", null, collectFx).then(r => console.log("fx:", r));

  const steps: [string, (sid: string, t: string) => Promise<number>][] = [
    ["tariffs", collectTariffs],
    ["stocks", collectStocks],
    ["orders", collectOrders],
    ["sales", collectSales],
    ["adv", collectAdv],
    ["finreport", collectFinreport], // backfill с 29.01.2024 — самый долгий, последним
  ];
  for (const [name, fn] of steps) {
    for (const { cabinet, token } of cabs) {
      const r = await runCollector(name, cabinet.sid, () => fn(cabinet.sid, token));
      console.log(`${name} ${cabinet.sid}:`, r.ok ? `ok, ${r.rows} строк` : `ошибка: ${r.error}`);
    }
  }
  console.log("Первичный сбор завершён");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
