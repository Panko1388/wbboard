// Контент карточек (Content API WB): реальные ссылки на фото, название, бренд, предмет.
// content-api.wildberries.ru — ОТДЕЛЬНЫЙ хост (не statistics-api), свой лимит, под штрафной
// шлагбаум статистики не попадает. Нужен скоуп токена «Контент». Запускается раз в день.
import { wbPost } from "@/lib/wb/client";
import { db } from "@/lib/db";

const CONTENT_URL = "https://content-api.wildberries.ru/content/v2/get/cards/list";

type Photo = { big?: string; c246x328?: string; square?: string; tm?: string };
type Card = {
  nmID: number; photos?: Photo[]; title?: string; brand?: string;
  subjectName?: string; vendorCode?: string;
};
type Resp = { cards?: Card[]; cursor?: { updatedAt?: string; nmID?: number; total?: number } };

export async function collectContent(cabinetSid: string, token: string): Promise<number> {
  let updatedAt: string | undefined;
  let nmID: number | undefined;
  let n = 0;

  for (let page = 0; page < 30; page++) {
    const body = {
      settings: {
        cursor: { limit: 100, ...(updatedAt ? { updatedAt, nmID } : {}) },
        filter: { withPhoto: -1 },
      },
    };
    const resp = await wbPost<Resp>({ cabinetToken: token, url: CONTENT_URL, minIntervalMs: 1500, body });
    const cards = resp.cards ?? [];
    if (!cards.length) break;

    for (const c of cards) {
      const photo = c.photos?.[0]?.c246x328 ?? c.photos?.[0]?.big ?? c.photos?.[0]?.square ?? null;
      await db.product.upsert({
        where: { nmId: BigInt(c.nmID) },
        create: {
          nmId: BigInt(c.nmID), cabinetSid,
          vendorCode: c.vendorCode ?? String(c.nmID),
          title: c.title ?? c.vendorCode ?? String(c.nmID),
          brand: c.brand ?? null, subject: c.subjectName ?? null, photoUrl: photo,
        },
        update: {
          ...(photo ? { photoUrl: photo } : {}),
          ...(c.title ? { title: c.title } : {}),
          ...(c.brand ? { brand: c.brand } : {}),
          ...(c.subjectName ? { subject: c.subjectName } : {}),
        },
      });
      n++;
    }
    if (!resp.cursor || cards.length < 100) break;
    updatedAt = resp.cursor.updatedAt;
    nmID = resp.cursor.nmID;
  }
  return n;
}
