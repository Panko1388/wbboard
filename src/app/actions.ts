"use server";
// Server actions: закупки/отгрузки, рынок (MPstats), интеграции, COGS, кабинеты.
// ВАЖНО: каждый action проверяет права (модуль/уровень денег) — UI-гейт недостаточен,
// action можно дернуть прямым POST (находка аудита #1).
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, assertCan, assertCabinet, type SessionUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { fetchCompetitorCard } from "@/lib/mpstats/client";
import { runPhotoCheck } from "@/lib/photocheck/pipeline";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string) => Number(fd.get(k) ?? 0) || 0;

async function audit(
  action: string,
  guard?: { module?: string; levelA?: boolean },
  payload?: object,
): Promise<SessionUser> {
  const u = await requireUser();
  if (guard) assertCan(u, guard);
  await db.auditLog.create({ data: { userId: u.id, action, payload } });
  return u;
}

// ───────────── Закупки (PurchaseOrder) ─────────────

export async function createPO(fd: FormData) {
  await audit("po_create", { module: "stocks" });
  const count = await db.purchaseOrder.count();
  const number = `ЗК-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
  const supplierName = s(fd, "supplier");
  let supplierId: string | null = null;
  if (supplierName) {
    const sup = await db.supplier.findFirst({ where: { name: supplierName } })
      ?? await db.supplier.create({ data: { name: supplierName } });
    supplierId = sup.id;
  }
  const po = await db.purchaseOrder.create({
    data: {
      number, supplierId,
      currency: (s(fd, "currency") || "USD") as "USD" | "CNY" | "RUB",
      fxRate: n(fd, "fxRate") || null,
      etaAt: s(fd, "etaAt") ? new Date(s(fd, "etaAt")) : null,
      cargoCostRub: n(fd, "cargoCostRub"),
      comment: s(fd, "comment") || null,
    },
  });
  // позиции: nmId:qty:price через перенос строки
  const lines = s(fd, "items").split("\n").map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [nm, qty, price] = line.split(/[:;,\t]+/).map(x => x.trim());
    if (!nm || !qty) continue;
    await db.purchaseOrderItem.create({
      data: { poId: po.id, nmId: BigInt(nm), qty: Number(qty) || 0, priceCur: Number(price) || 0 },
    });
  }
  revalidatePath("/stocks");
}

export async function setPOStatus(fd: FormData) {
  await audit("po_status", { module: "stocks" });
  const id = s(fd, "id");
  const status = s(fd, "status") as "ORDERED" | "IN_TRANSIT" | "CANCELLED";
  await db.purchaseOrder.update({
    where: { id },
    data: { status, orderedAt: status === "ORDERED" ? new Date() : undefined },
  });
  revalidatePath("/stocks");
}

/** Приёмка ЗК на мой склад: создаёт партию COGS (фикс курса) + движение склада */
export async function receivePO(fd: FormData) {
  await audit("po_receive", { module: "stocks" });
  const id = s(fd, "id");
  // идемпотентность: двойной клик не задвоит партии COGS и приход склада (аудит #16)
  await db.$transaction(async tx => {
    const gate = await tx.purchaseOrder.updateMany({
      where: { id, status: "IN_TRANSIT" },
      data: { status: "AT_WAREHOUSE", arrivedAt: new Date() },
    });
    if (gate.count === 0) return; // уже принят или не в пути

    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
    const totalQty = po.items.reduce((sum, i) => sum + i.qty, 0) || 1;
    const cargoPerUnit = Number(po.cargoCostRub) / totalQty;
    const rate = Number(po.fxRate) || 1;

    for (const item of po.items) {
      const received = item.qty; // MVP: принимаем по плану; расхождения правятся корректировкой
      const batch = await tx.cogsBatch.create({
        data: {
          nmId: item.nmId, qty: received, currency: po.currency,
          priceCur: item.priceCur, rateAtPurchase: rate,
          deliveryPerUnit: Math.round(cargoPerUnit * 100) / 100,
          purchasedAt: po.orderedAt ?? po.createdAt, validFrom: new Date(),
        },
      });
      await tx.purchaseOrderItem.update({
        where: { id: item.id }, data: { receivedQty: received, cogsBatchId: batch.id },
      });
      await tx.warehouseMove.create({
        data: { nmId: item.nmId, qty: received, reason: "po_receive", refId: po.number },
      });
      await tx.myStock.upsert({
        where: { nmId: item.nmId },
        create: { nmId: item.nmId, qty: received },
        update: { qty: { increment: received } },
      });
    }
  });
  revalidatePath("/stocks");
}

// ───────────── Отгрузки на WB (Shipment) ─────────────

export async function createShipment(fd: FormData) {
  const u = await audit("shipment_create", { module: "stocks" });
  assertCabinet(u, s(fd, "cabinetSid"));
  const count = await db.shipment.count();
  const number = `ОТ-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
  const sh = await db.shipment.create({
    data: {
      number, cabinetSid: s(fd, "cabinetSid"), warehouse: s(fd, "warehouse") || "Коледино",
      boxCount: n(fd, "boxCount"), wbSupplyId: s(fd, "wbSupplyId") || null, comment: s(fd, "comment") || null,
    },
  });
  const lines = s(fd, "items").split("\n").map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [nm, qty] = line.split(/[:;,\t]+/).map(x => x.trim());
    if (!nm || !qty) continue;
    await db.shipmentItem.create({ data: { shipmentId: sh.id, nmId: BigInt(nm), qty: Number(qty) || 0 } });
  }
  revalidatePath("/stocks");
}

/** Отгрузить: списать с моего склада, статус SENT */
export async function sendShipment(fd: FormData) {
  await audit("shipment_send", { module: "stocks" });
  const id = s(fd, "id");
  // гонка двух отправок закрыта гейтом по статусу внутри транзакции (аудит #16)
  await db.$transaction(async tx => {
    const gate = await tx.shipment.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "SENT", sentAt: new Date() },
    });
    if (gate.count === 0) return;
    const sh = await tx.shipment.findUniqueOrThrow({ where: { id }, include: { items: true } });
    for (const item of sh.items) {
      await tx.warehouseMove.create({
        data: { nmId: item.nmId, qty: -item.qty, reason: "shipment", refId: sh.number },
      });
      await tx.myStock.upsert({
        where: { nmId: item.nmId },
        create: { nmId: item.nmId, qty: -item.qty },
        update: { qty: { decrement: item.qty } },
      });
    }
  });
  revalidatePath("/stocks");
}

/** Приёмка WB: фиксируем фактически принятое */
export async function acceptShipment(fd: FormData) {
  await audit("shipment_accept", { module: "stocks" });
  const id = s(fd, "id");
  const sh = await db.shipment.findUnique({ where: { id }, include: { items: true } });
  if (!sh) return;
  let partial = false;
  for (const item of sh.items) {
    const acc = Number(fd.get(`acc_${item.id}`) ?? item.qty) || 0;
    if (acc !== item.qty) partial = true;
    await db.shipmentItem.update({ where: { id: item.id }, data: { acceptedQty: acc } });
  }
  await db.shipment.update({
    where: { id }, data: { status: partial ? "PARTIAL" : "ACCEPTED", acceptedAt: new Date() },
  });
  revalidatePath("/stocks");
}

export async function adjustMyStock(fd: FormData) {
  await audit("stock_adjust", { module: "stocks" });
  const nmId = BigInt(s(fd, "nmId"));
  const qty = n(fd, "qty");
  await db.warehouseMove.create({ data: { nmId, qty, reason: "correction", comment: s(fd, "comment") || null } });
  await db.myStock.upsert({ where: { nmId }, create: { nmId, qty }, update: { qty: { increment: qty } } });
  revalidatePath("/stocks");
}

// ───────────── Рынок (MPstats) ─────────────

export async function addCompetitor(fd: FormData) {
  await audit("mp_competitor_add", { module: "market" });
  const nmId = Number(s(fd, "nmId").replace(/\D/g, ""));
  if (!nmId) return;
  const card = await fetchCompetitorCard(nmId);
  await db.mpCompetitor.upsert({
    where: { nmId: BigInt(nmId) },
    create: { nmId: BigInt(nmId), title: card.title, brand: card.brand, category: card.category, photoUrl: card.photoUrl },
    update: { active: true },
  });
  revalidatePath("/market");
}

export async function removeCompetitor(fd: FormData) {
  await audit("mp_competitor_off", { module: "market" });
  await db.mpCompetitor.update({ where: { id: s(fd, "id") }, data: { active: false } });
  revalidatePath("/market");
}

export async function addKeyword(fd: FormData) {
  await audit("mp_keyword_add", { module: "market" });
  const phrase = s(fd, "phrase").toLowerCase();
  if (!phrase) return;
  await db.mpKeyword.upsert({ where: { phrase }, create: { phrase }, update: { active: true } });
  revalidatePath("/market");
}

export async function addCategory(fd: FormData) {
  await audit("mp_category_add", { module: "market" });
  const path = s(fd, "path");
  if (!path) return;
  const t = await db.target.findUnique({ where: { key: "mp_categories" } });
  const list: string[] = Array.isArray(t?.value) ? (t!.value as string[]) : [];
  if (!list.includes(path)) list.push(path);
  await db.target.upsert({
    where: { key: "mp_categories" },
    create: { key: "mp_categories", value: list },
    update: { value: list },
  });
  revalidatePath("/market");
}

/** Обновить данные рынка сейчас (вне расписания) */
export async function refreshMarketNow() {
  await audit("mp_refresh", { module: "market" });
  const { collectMpstats } = await import("@/collectors/mpstats");
  const { runCollector } = await import("@/lib/runner");
  await runCollector("mpstats", null, collectMpstats);
  revalidatePath("/market");
}

// ───────────── Интеграции и кабинеты ─────────────

export async function saveIntegration(fd: FormData) {
  await audit("integration_save", { module: "settings", levelA: true });
  const key = s(fd, "key");
  const token = s(fd, "token");
  await db.integration.upsert({
    where: { key },
    create: { key, tokenEnc: token ? encrypt(token) : null, active: !!token },
    update: { tokenEnc: token ? encrypt(token) : undefined, active: !!token },
  });
  revalidatePath("/settings");
}

export async function saveCabinet(fd: FormData) {
  await audit("cabinet_save", { module: "settings", levelA: true });
  const sid = s(fd, "sid");
  const name = s(fd, "name") || sid;
  const token = s(fd, "token");
  await db.cabinet.upsert({ where: { sid }, create: { sid, name }, update: { name } });
  if (token) {
    await db.cabinetToken.upsert({
      where: { cabinetSid: sid },
      create: {
        cabinetSid: sid, tokenEnc: encrypt(token),
        issuedAt: new Date(), expiresAt: new Date(Date.now() + 180 * 864e5),
      },
      update: { tokenEnc: encrypt(token), issuedAt: new Date(), expiresAt: new Date(Date.now() + 180 * 864e5) },
    });
    await db.cabinet.update({ where: { sid }, data: { tokenIssuedAt: new Date() } });
  }
  revalidatePath("/settings");
}

/** Запустить коллектор вручную (кнопка «Собрать сейчас») */
export async function runCollectorNow(fd: FormData) {
  await audit("collector_run_now", { module: "settings", levelA: true });
  const name = s(fd, "name");
  const { runCollector, activeCabinetsWithTokens } = await import("@/lib/runner");
  if (name === "fx") {
    const { collectFx } = await import("@/collectors/fx");
    await runCollector("fx", null, collectFx);
  } else if (name === "mpstats") {
    const { collectMpstats } = await import("@/collectors/mpstats");
    await runCollector("mpstats", null, collectMpstats);
  } else {
    const collectors: Record<string, (sid: string, token: string) => Promise<number>> = {
      orders: (await import("@/collectors/orders")).collectOrders,
      sales: (await import("@/collectors/sales")).collectSales,
      stocks: (await import("@/collectors/stocks")).collectStocks,
      finreport: (await import("@/collectors/finreport")).collectFinreport,
      tariffs: (await import("@/collectors/tariffs")).collectTariffs,
      adv: (await import("@/collectors/adv")).collectAdv,
      funnel: (await import("@/collectors/funnel")).collectFunnel,
    };
    const fn = collectors[name];
    if (fn) {
      for (const { cabinet, token } of await activeCabinetsWithTokens()) {
        await runCollector(name, cabinet.sid, () => fn(cabinet.sid, token));
      }
    }
  }
  revalidatePath("/pulse");
  revalidatePath("/settings");
}

// ───────────── COGS и расходы ─────────────

export async function addCogsBatch(fd: FormData) {
  await audit("edit_cogs", { levelA: true });
  await db.cogsBatch.create({
    data: {
      nmId: BigInt(s(fd, "nmId")), qty: n(fd, "qty"),
      currency: (s(fd, "currency") || "USD") as "USD" | "CNY" | "RUB",
      priceCur: n(fd, "priceCur"), rateAtPurchase: n(fd, "rate") || 1,
      deliveryPerUnit: n(fd, "delivery"), purchasedAt: new Date(), validFrom: new Date(),
    },
  });
  revalidatePath("/products");
}

export async function addIndirect(fd: FormData) {
  await audit("indirect_add", { module: "fin", levelA: true });
  const month = s(fd, "month") || new Date().toISOString().slice(0, 7);
  await db.indirectExpense.create({
    data: {
      category: s(fd, "category") || "Прочее", amount: n(fd, "amount"),
      monthFrom: new Date(`${month}-01`), monthTo: new Date(`${month}-01`),
      comment: s(fd, "comment") || null,
    },
  });
  revalidatePath("/fin");
}

// ───────────── Планы на день (для TG-отчёта) ─────────────

export async function savePlans(fd: FormData) {
  await audit("plans_save", { module: "settings", levelA: true });
  const pairs: [string, string][] = [
    ["plan_orders_month", "orders"], ["plan_buyouts_month", "buyouts"], ["plan_profit_month", "profit"],
  ];
  for (const [key, field] of pairs) {
    const v = n(fd, field);
    await db.target.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
  }
  revalidatePath("/settings");
}

// ───────────── Тема оформления ─────────────

export async function setTheme(fd: FormData) {
  await requireUser();
  const theme = s(fd, "theme") === "glass" ? "glass" : "helium";
  const { cookies } = await import("next/headers");
  (await cookies()).set("wbboard_theme", theme, { maxAge: 365 * 864e2, path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
}

// ───────────── Фото-чек ─────────────

export async function retryPhotoCheck(fd: FormData) {
  await audit("photocheck_retry", { module: "photocheck" });
  const id = s(fd, "id");
  await db.photoCheck.update({ where: { id }, data: { status: "QUEUED", error: null } });
  await runPhotoCheck(id);
  revalidatePath("/photocheck");
}
