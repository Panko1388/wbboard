// Сид: роли + владелец всегда; демо-данные (кабинет demo, 60 дней статистики) — npm run seed.
// Повторный запуск безопасен (upsert/skip). Демо-кабинет можно скрыть: UPDATE "Cabinet" SET active=false WHERE sid='demo'.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const db = new PrismaClient();

function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

async function main() {
  // ── роли (матрица из 60-ux-cabinets) ──
  const roles = [
    { name: "Собственник", modules: ["*"], moneyLevel: "A" as const },
    { name: "Менеджер МП", modules: ["pulse", "rnp", "products", "adv", "stocks", "market", "promo", "photocheck"], moneyLevel: "B" as const },
    { name: "Трафик", modules: ["pulse", "rnp", "adv", "market"], moneyLevel: "C" as const },
    { name: "Финансист", modules: ["pulse", "pnl", "fin", "products"], moneyLevel: "A" as const },
    { name: "Закупки", modules: ["products", "stocks", "market", "photocheck"], moneyLevel: "C" as const },
  ];
  for (const r of roles) {
    // update: {} — не перетирать кастомизацию ролей при повторных запусках (аудит #8)
    await db.role.upsert({ where: { name: r.name }, create: r, update: {} });
  }
  const owner = await db.role.findUniqueOrThrow({ where: { name: "Собственник" } });
  const manager = await db.role.findUniqueOrThrow({ where: { name: "Менеджер МП" } });

  // У менеджера СВОЙ пароль — общий с владельцем обнулял весь RBAC (аудит #2)
  const adminPass = process.env.SEED_ADMIN_PASSWORD || "wbboard123";
  const managerPass = process.env.SEED_MANAGER_PASSWORD || "manager123";
  await db.user.upsert({
    where: { email: "admin@wbboard.local" },
    create: { email: "admin@wbboard.local", name: "Андрей", passHash: hashPassword(adminPass), roleId: owner.id },
    update: {},
  });
  await db.user.upsert({
    where: { email: "manager@wbboard.local" },
    create: { email: "manager@wbboard.local", name: "Менеджер", passHash: hashPassword(managerPass), roleId: manager.id },
    update: {},
  });
  console.log(`Владелец: admin@wbboard.local / ${adminPass}`);
  console.log(`Менеджер: manager@wbboard.local / ${managerPass}`);

  if (process.env.SEED_DEMO === "0") { console.log("SEED_DEMO=0 — демо-данные пропущены"); return; }
  const existing = await db.order.count({ where: { cabinetSid: "demo" } });
  if (existing > 0) { console.log("Демо-данные уже есть — пропуск"); return; }

  // ── демо-кабинет и товары ──
  await db.cabinet.upsert({ where: { sid: "demo" }, create: { sid: "demo", name: "Демо-кабинет" }, update: {} });
  const products = [
    { nmId: 221450789n, vendorCode: "ORG-15", title: "Органайзер для хранения 15л", subject: "Короба для хранения", priceR: 790, usd: 2.1 },
    { nmId: 221450790n, vendorCode: "ORG-30", title: "Органайзер для хранения 30л", subject: "Короба для хранения", priceR: 1190, usd: 3.4 },
    { nmId: 198332451n, vendorCode: "HOLD-1", title: "Держатель для телефона в авто", subject: "Держатели для телефонов", priceR: 450, usd: 1.1 },
    { nmId: 198332452n, vendorCode: "LAMP-D", title: "Лампа настольная LED", subject: "Настольные лампы", priceR: 1390, usd: 4.2 },
    { nmId: 245118903n, vendorCode: "KIT-CONT", title: "Набор контейнеров 10 шт", subject: "Контейнеры для продуктов", priceR: 890, usd: 2.6 },
    { nmId: 245118904n, vendorCode: "MAT-XL", title: "Коврик для мыши XL", subject: "Коврики для мыши", priceR: 390, usd: 0.9 },
    { nmId: 267501122n, vendorCode: "HOOK-12", title: "Крючки самоклеящиеся 12 шт", subject: "Крючки", priceR: 290, usd: 0.6 },
    { nmId: 267501123n, vendorCode: "BOX-SH", title: "Коробка для обуви с окном", subject: "Короба для хранения", priceR: 540, usd: 1.4 },
  ];
  for (const p of products) {
    await db.product.upsert({
      where: { nmId: p.nmId },
      create: { nmId: p.nmId, cabinetSid: "demo", vendorCode: p.vendorCode, title: p.title, subject: p.subject },
      update: {},
    });
    await db.cogsBatch.create({
      data: {
        nmId: p.nmId, qty: 500, currency: "USD", priceCur: p.usd, rateAtPurchase: 77.9,
        deliveryPerUnit: 18, purchasedAt: new Date(Date.now() - 70 * 864e5), validFrom: new Date(Date.now() - 70 * 864e5),
      },
    });
  }

  // ── 60 дней заказов/продаж/рекламы/воронки ──
  const r = rng(42);
  let orderId = 1;
  for (let d = 60; d >= 0; d--) {
    const day = new Date(Date.now() - d * 864e5);
    const dayStr = day.toISOString().slice(0, 10);
    const weekend = [0, 6].includes(day.getDay()) ? 1.3 : 1;
    for (const p of products) {
      const base = 2 + Math.floor(r() * 9);
      const cnt = Math.max(0, Math.round(base * weekend * (0.6 + r() * 0.9)));
      for (let i = 0; i < cnt; i++) {
        const dt = new Date(day.getTime() + Math.floor(r() * 20) * 36e5);
        const price = Math.round(p.priceR * (0.93 + r() * 0.12));
        await db.order.create({
          data: {
            id: `demo-o-${orderId++}`, date: dt, lastChangeDate: dt, nmId: p.nmId, cabinetSid: "demo",
            totalPrice: Math.round(price * 1.45), priceWithDisc: price, spp: 5,
            warehouse: ["Коледино", "Электросталь", "Казань"][Math.floor(r() * 3)],
            region: ["Центральный", "Приволжский", "Южный"][Math.floor(r() * 3)],
            isCancel: r() > 0.97,
          },
        });
        // выкуп через 2-5 дней с вероятностью 85%
        if (r() < 0.85 && d >= 3) {
          const saleDt = new Date(dt.getTime() + (2 + Math.floor(r() * 3)) * 864e5);
          if (saleDt < new Date()) {
            const isReturn = r() > 0.96;
            await db.sale.create({
              data: {
                saleId: `demo-${isReturn ? "R" : "S"}-${orderId}-${i}`, date: saleDt, nmId: p.nmId,
                cabinetSid: "demo", forPay: Math.round(price * 0.74), priceWithDisc: price,
                type: isReturn ? "R" : "S",
              },
            });
          }
        }
      }
      // реклама
      if (r() < 0.8) {
        await db.advDaily.create({
          data: {
            date: new Date(dayStr), nmId: p.nmId, cabinetSid: "demo",
            campaignId: BigInt(9000 + products.indexOf(p)), campaignType: r() > 0.5 ? "auto" : "search-catalog",
            views: Math.floor(500 + r() * 4000), clicks: Math.floor(10 + r() * 120),
            spend: Math.round((cnt * p.priceR) * (0.05 + r() * 0.09)),
            ordersRub: Math.round(cnt * p.priceR * (0.5 + r() * 0.5)),
          },
        });
      }
      await db.funnelDaily.create({
        data: {
          date: new Date(dayStr), nmId: p.nmId,
          openCard: Math.floor(cnt * (20 + r() * 40)), addToCart: Math.floor(cnt * (3 + r() * 6)),
          orders: cnt, buyouts: Math.round(cnt * 0.85),
        },
      }).catch(() => {});
    }
  }

  // ── снапшоты остатков (30 дней × 2) ──
  for (let d = 30; d >= 0; d--) {
    const takenAt = new Date(Date.now() - d * 864e5);
    for (const p of products) {
      const baseQty = 80 + Math.floor(r() * 400);
      for (const wh of ["Коледино", "Электросталь"]) {
        await db.stockSnapshot.create({
          data: {
            takenAt, nmId: p.nmId, cabinetSid: "demo", warehouse: wh,
            qty: Math.max(0, baseQty - d * 2 + Math.floor(r() * 30)),
            inWayToClient: Math.floor(r() * 15), inWayFromClient: Math.floor(r() * 4),
          },
        });
      }
    }
  }

  // ── финотчёт: 4 закрытые недели ──
  let rrd = 1n;
  for (let w = 4; w >= 1; w--) {
    const repId = BigInt(310000000 + w);
    for (let dd = 0; dd < 7; dd++) {
      const dt = new Date(Date.now() - (w * 7 + dd) * 864e5);
      for (const p of products) {
        const sold = 2 + Math.floor(r() * 8);
        const retail = sold * p.priceR;
        await db.finreportRow.create({
          data: {
            rrdId: rrd++, realizationreportId: repId, rrDt: dt, nmId: p.nmId, cabinetSid: "demo",
            docType: "Продажа", supplierOperName: "Продажа",
            retailAmount: retail, ppvzForPay: Math.round(retail * 0.74),
            deliveryRub: sold * 52, storageFee: Math.round(sold * 5.5),
            acceptance: 0, penalty: r() > 0.93 ? 150 : 0, deduction: 0,
            acquiringFee: Math.round(retail * 0.018), ppvzVw: Math.round(retail * 0.21),
            raw: {},
          },
        });
      }
    }
  }

  // ── поставки: пример полной цепочки ──
  const sup = await db.supplier.create({ data: { name: "Yiwu Smart Storage Co.", contact: "wechat: yiwu_storage" } });
  const po1 = await db.purchaseOrder.create({
    data: {
      number: "ЗК-2026-001", supplierId: sup.id, status: "AT_WAREHOUSE", currency: "USD", fxRate: 77.9,
      orderedAt: new Date(Date.now() - 40 * 864e5), arrivedAt: new Date(Date.now() - 12 * 864e5),
      etaAt: new Date(Date.now() - 14 * 864e5), cargoCostRub: 54000, comment: "карго 380 кг",
    },
  });
  await db.purchaseOrderItem.createMany({
    data: [
      { poId: po1.id, nmId: 221450789n, qty: 1000, priceCur: 2.1, receivedQty: 1000 },
      { poId: po1.id, nmId: 221450790n, qty: 600, priceCur: 3.4, receivedQty: 600 },
      { poId: po1.id, nmId: 267501123n, qty: 800, priceCur: 1.4, receivedQty: 800 },
    ],
  });
  await db.purchaseOrder.create({
    data: {
      number: "ЗК-2026-002", supplierId: sup.id, status: "IN_TRANSIT", currency: "USD", fxRate: 78.4,
      orderedAt: new Date(Date.now() - 9 * 864e5), etaAt: new Date(Date.now() + 11 * 864e5),
      cargoCostRub: 38000,
      items: { create: [
        { nmId: 198332452n, qty: 400, priceCur: 4.2 },
        { nmId: 245118903n, qty: 700, priceCur: 2.6 },
      ] },
    },
  });
  for (const [nm, qty] of [[221450789n, 620], [221450790n, 380], [267501123n, 500]] as [bigint, number][]) {
    await db.warehouseMove.create({ data: { nmId: nm, qty, reason: "po_receive", refId: "ЗК-2026-001" } });
    await db.myStock.upsert({ where: { nmId: nm }, create: { nmId: nm, qty }, update: { qty } });
  }
  const sh1 = await db.shipment.create({
    data: {
      number: "ОТ-2026-001", cabinetSid: "demo", warehouse: "Коледино", boxCount: 12,
      status: "ACCEPTED", sentAt: new Date(Date.now() - 8 * 864e5), acceptedAt: new Date(Date.now() - 5 * 864e5),
      wbSupplyId: "WB-S-481209",
    },
  });
  await db.shipmentItem.createMany({
    data: [
      { shipmentId: sh1.id, nmId: 221450789n, qty: 380, acceptedQty: 380 },
      { shipmentId: sh1.id, nmId: 221450790n, qty: 220, acceptedQty: 218 },
    ],
  });
  await db.shipment.create({
    data: {
      number: "ОТ-2026-002", cabinetSid: "demo", warehouse: "Электросталь", boxCount: 6, status: "DRAFT",
      items: { create: [{ nmId: 267501123n, qty: 300 }] },
    },
  });

  // ── рынок: ниши/конкуренты/ключи (мок наполнит историю) ──
  await db.target.upsert({
    where: { key: "mp_categories" },
    create: { key: "mp_categories", value: ["Дом/Хранение вещей", "Автотовары/Аксессуары", "Кухня/Хранение продуктов"] },
    update: {},
  });
  for (const nm of [178402341, 165209876, 201554321]) {
    await db.mpCompetitor.upsert({
      where: { nmId: BigInt(nm) },
      create: { nmId: BigInt(nm), title: `Топ-конкурент ${nm}`, brand: ["HomeStore", "AutoPro", "KitchenLab"][nm % 3], category: "Дом/Хранение вещей" },
      update: {},
    });
  }
  for (const ph of ["органайзер для хранения", "держатель для телефона в машину", "контейнеры для еды набор"]) {
    await db.mpKeyword.upsert({ where: { phrase: ph }, create: { phrase: ph }, update: {} });
  }
  const { collectMpstats } = await import("../src/collectors/mpstats");
  // история 30 дней мок-данных рынка
  for (let d = 30; d >= 0; d -= 30) await collectMpstats();

  // ── курс валют 30 дней ──
  for (let d = 30; d >= 0; d--) {
    const date = new Date(new Date(Date.now() - d * 864e5).toISOString().slice(0, 10));
    await db.fxRate.upsert({
      where: { date },
      create: { date, usdRubCbr: 77.2 + Math.sin(d / 5) * 1.4, cnyRub: 10.8 + Math.sin(d / 7) * 0.3, source: "demo" },
      update: {},
    });
  }

  // ── collector_run для свежести ──
  for (const name of ["orders", "sales", "stocks", "adv", "finreport", "mpstats", "fx"]) {
    await db.collectorRun.create({
      data: { name, cabinetSid: name === "fx" || name === "mpstats" ? null : "demo", finishedAt: new Date(), status: "ok", rowsUpserted: 100 },
    });
  }

  console.log("Демо-данные загружены: кабинет «Демо-кабинет», 8 SKU, 60 дней статистики, цепочка поставок, рынок.");
}

main().finally(() => db.$disconnect());
