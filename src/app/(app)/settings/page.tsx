// Настройки: кабинеты и токены, интеграции (MPstats), роли, коллекторы
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveCabinet, saveIntegration, runCollectorNow, savePlans } from "@/app/actions";
import { CabinetRow } from "@/components/CabinetRow";

export const dynamic = "force-dynamic";

const COLLECTORS = ["orders", "sales", "stocks", "finreport", "tariffs", "adv", "funnel", "content", "fx", "mpstats"];

export default async function SettingsPage() {
  const user = await requireUser();
  const isOwner = user.role.name === "Собственник";
  if (!isOwner) {
    return (<><h1>Настройки</h1><p className="sub">Раздел доступен только Собственнику.</p></>);
  }

  const [cabinets, tokens, integrations, roles, users, runs, planRows] = await Promise.all([
    db.cabinet.findMany({ orderBy: { name: "asc" } }),
    db.cabinetToken.findMany(),
    db.integration.findMany(),
    db.role.findMany({ include: { users: true } }),
    db.user.findMany({ include: { role: true } }),
    db.collectorRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
    db.target.findMany({ where: { key: { in: ["plan_orders_month", "plan_buyouts_month", "plan_profit_month"] } } }),
  ]);
  const mp = integrations.find(i => i.key === "mpstats");
  const plan = (k: string) => {
    const v = planRows.find(p => p.key === k)?.value;
    const num = typeof v === "number" ? v : Number(v);
    return Number.isFinite(num) && num > 0 ? num : "";
  };

  return (
    <>
      <h1>Настройки · кабинеты, интеграции и роли</h1>
      <p className="sub">Токены шифруются AES-GCM (ключ TOKEN_KEY в env), read-only скоупы (ADR-006)</p>

      <div className="grid2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Кабинеты WB</h2>
          {cabinets.map(c => {
            const t = tokens.find(x => x.cabinetSid === c.sid);
            const daysLeft = t?.expiresAt ? Math.floor((t.expiresAt.getTime() - Date.now()) / 864e5) : null;
            return (
              <CabinetRow key={c.sid} sid={c.sid} name={c.name} hasToken={!!t} daysLeft={daysLeft} />
            );
          })}
          <form action={saveCabinet} className="frm" style={{ flexDirection: "column", alignItems: "stretch", marginTop: 10 }}>
            <label>ID кабинета (sid, как в финотчёте)<input type="text" name="sid" required placeholder="123456" /></label>
            <label>Название<input type="text" name="name" placeholder="ИП Иванов" /></label>
            <label>WB-токен (тип «базовый», read-only)<input type="password" name="token" placeholder="вставить токен" /></label>
            <button className="btn acc" type="submit">Сохранить кабинет</button>
          </form>
          <p className="sm mut" style={{ marginTop: 6 }}>
            Скоупы: Статистика, Аналитика, Продвижение, Контент, Цены, Финансы. Живёт 180 дней — алерт за 14.
          </p>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h2 style={{ marginTop: 0 }}>Интеграции</h2>
            <div className="tok">
              <b>MPstats API</b>
              <span style={{ flex: 1 }} />
              {mp?.active
                ? <span className="chip ok">подключено</span>
                : <span className="chip warn">мок-режим</span>}
            </div>
            <form action={saveIntegration} className="frm" style={{ marginTop: 8 }}>
              <input type="hidden" name="key" value="mpstats" />
              <label style={{ flex: 1 }}>API-токен MPstats<input type="password" name="token" placeholder="вставить при покупке подписки" /></label>
              <button className="btn acc" type="submit">Сохранить</button>
            </form>
            <p className="sm mut" style={{ marginTop: 6 }}>
              Пока токена нет — модуль «Аналитика рынка» работает на мок-данных. Решение по подписке — перед фазой 2 (ADR-004).
            </p>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <h2 style={{ marginTop: 0 }}>Планы на месяц — для TG-отчёта</h2>
            <form action={savePlans} className="frm">
              <label>Заказы, ₽/мес<input type="number" name="orders" defaultValue={plan("plan_orders_month")} placeholder="42000000" style={{ width: 140 }} /></label>
              <label>Выкупы, ₽/мес<input type="number" name="buyouts" defaultValue={plan("plan_buyouts_month")} placeholder="36000000" style={{ width: 140 }} /></label>
              <label>Прибыль, ₽/мес<input type="number" name="profit" defaultValue={plan("plan_profit_month")} placeholder="11000000" style={{ width: 140 }} /></label>
              <button className="btn acc" type="submit">Сохранить планы</button>
            </form>
            <p className="sm mut" style={{ marginTop: 8 }}>
              Утренний отчёт сам посчитает: норму дня (план ÷ дни месяца), факт против нормы с 🟢/🔴,
              и главное — выполнение месячного плана текущим темпом («сделано X из Y, темпом Z → прогноз N% плана»). 0 = план не задан.
            </p>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Коллекторы — запустить сейчас</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {COLLECTORS.map(c => (
                <form action={runCollectorNow} key={c}>
                  <input type="hidden" name="name" value={c} />
                  <button className="btn" type="submit">{c}</button>
                </form>
              ))}
            </div>
            <h2>Последние запуски</h2>
            <div className="ul">
              {runs.map(r => (
                <div className="li" key={String(r.id)}>
                  <span>{r.name}{r.cabinetSid ? ` · ${r.cabinetSid}` : ""} <span className="sm mut">{r.startedAt.toLocaleString("ru-RU")}</span></span>
                  <span className={`chip ${r.status === "ok" ? "ok" : r.status === "error" ? "bad" : "mut"}`}>
                    {r.status === "ok" ? `ok · ${r.rowsUpserted}` : r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <h2>Роли и пользователи</h2>
      <div className="grid2">
        <div className="card rolecard">
          {roles.map(r => (
            <div className="perm" key={r.id}>
              <span><b>{r.name}</b> <span className="sm mut">{r.users.length} чел.</span></span>
              <span className="sm mut">деньги: {r.moneyLevel} · {r.modules.includes("*") ? "все модули" : r.modules.join(", ")}</span>
            </div>
          ))}
        </div>
        <div className="card">
          {users.map(u => (
            <div className="perm" key={u.id}>
              <span><b>{u.name}</b> <span className="sm mut">{u.email}</span></span>
              <span className="chip mut">{u.role.name}</span>
            </div>
          ))}
          <p className="sm mut" style={{ marginTop: 8 }}>
            Создание пользователей — через seed или Prisma Studio (npm run db:studio). UI-формы — неделя 5 (RBAC-матрица из ТЗ).
          </p>
        </div>
      </div>
    </>
  );
}
