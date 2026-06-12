// Смена пароля пользователя: npx tsx scripts/set-password.ts <email> [новый-пароль]
// Без второго аргумента пароль генерируется и печатается.
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const db = new PrismaClient();

async function main() {
  const email = (process.argv[2] ?? "").toLowerCase();
  if (!email) {
    console.log("Использование: npx tsx scripts/set-password.ts <email> [новый-пароль]");
    process.exit(1);
  }
  const pass = process.argv[3] || randomBytes(9).toString("base64url").replace(/[-_]/g, "a").slice(0, 12);
  const user = await db.user.update({ where: { email }, data: { passHash: hashPassword(pass) } });
  console.log(`Пароль обновлён: ${user.email} / ${pass}`);
}

main()
  .catch(e => { console.error("Ошибка:", e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => db.$disconnect());
