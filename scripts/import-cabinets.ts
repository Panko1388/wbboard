// Импорт кабинетов из env: каждая переменная WB_TOKEN_<NAME> → Cabinet + CabinetToken (шифрованный).
// Используется при деплое: токены уже лежат в /opt/wbboard/.env (вписаны в прошлой сессии).
import { PrismaClient } from "@prisma/client";
import { encrypt } from "../src/lib/crypto";

const db = new PrismaClient();

async function main() {
  const entries = Object.entries(process.env)
    .filter(([k, v]) => k.startsWith("WB_TOKEN_") && v && v.length > 20);
  if (!entries.length) {
    console.log("WB_TOKEN_* в env не найдены — кабинеты добавляйте через UI (Настройки → Кабинеты)");
    return;
  }
  for (const [key, token] of entries) {
    const slug = key.replace("WB_TOKEN_", "").toLowerCase();
    const name = slug.charAt(0).toUpperCase() + slug.slice(1);
    await db.cabinet.upsert({
      where: { sid: slug },
      create: { sid: slug, name, tokenIssuedAt: new Date() },
      update: {},
    });
    await db.cabinetToken.upsert({
      where: { cabinetSid: slug },
      create: {
        cabinetSid: slug, tokenEnc: encrypt(token!),
        issuedAt: new Date(), expiresAt: new Date(Date.now() + 180 * 864e5),
      },
      // update: {} — токен в БД главнее: ротация через UI не должна откатываться
      // старым .env при каждом деплое (риск-аудит #7)
      update: {},
    });
    console.log(`Кабинет «${name}» (${slug}): токен в БД (новый импортирован только если кабинета не было)`);
  }
}

main().finally(() => db.$disconnect());
