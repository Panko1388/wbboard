import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser, canSee } from "@/lib/auth";
import { db } from "@/lib/db";
import { setTheme } from "@/app/actions";
import { CabinetSeg } from "@/components/CabinetSeg";

export const dynamic = "force-dynamic";

const NAV: { grp: string; items: { key: string; href: string; ic: string; label: string }[] }[] = [
  {
    grp: "Операции",
    items: [
      { key: "pulse", href: "/pulse", ic: "⚡", label: "Пульс" },
      { key: "rnp", href: "/rnp", ic: "📈", label: "РНП" },
      { key: "pnl", href: "/pnl", ic: "💰", label: "P&L · ОПиУ" },
      { key: "products", href: "/products", ic: "📦", label: "Товары" },
      { key: "adv", href: "/adv", ic: "🎯", label: "Реклама" },
    ],
  },
  {
    grp: "Поставки",
    items: [{ key: "stocks", href: "/stocks", ic: "🏭", label: "Остатки и поставки" }],
  },
  {
    grp: "Рынок",
    items: [
      { key: "market", href: "/market", ic: "🔭", label: "Аналитика рынка" },
      { key: "promo", href: "/promo", ic: "🏷️", label: "Акции" },
    ],
  },
  {
    grp: "Финансы",
    items: [{ key: "fin", href: "/fin", ic: "🧾", label: "Финансы" }],
  },
  {
    grp: "Система",
    items: [
      { key: "settings", href: "/settings", ic: "⚙️", label: "Настройки" },
      // Фото-чек — в самом конце меню (фаза 3)
      { key: "photocheck", href: "/photocheck", ic: "📸", label: "Фото-чек" },
    ],
  },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const ck = await cookies();
  const fx = await db.fxRate.findFirst({ orderBy: { date: "desc" } });
  const theme = ck.get("wbboard_theme")?.value === "helium" ? "helium" : "glass";

  // кабинеты для селектора: владельцу — все активные, сотруднику — только его
  const allCabs = await db.cabinet.findMany({ where: { active: true }, select: { sid: true, name: true }, orderBy: { name: "asc" } });
  const myCabs = user.cabinets.length ? allCabs.filter(c => user.cabinets.includes(c.sid)) : allCabs;
  const curCab = ck.get("wbboard_cab")?.value || "all";

  return (
    <>
      <header id="top">
        <Link href="/pulse" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="WBoard" style={{ height: 30, display: "block" }} />
        </Link>
        <span className="badge-proto">MVP</span>
        <CabinetSeg cabinets={myCabs} current={curCab} />
        <span className="sp" />
        {fx?.usdRubCbr && (
          <span className="fxchip num" title="Курс ЦБ РФ (usdRubCash — в Настройках)">
            $ {Number(fx.usdRubCbr).toFixed(2)} ₽ <span className="src">{fx.source}</span>
          </span>
        )}
        <form action={setTheme} className="seg theme-seg" title="Тема оформления — выбираем лучшую">
          <button name="theme" value="helium" className={theme === "helium" ? "on" : ""} type="submit">Гелий</button>
          <button name="theme" value="glass" className={theme === "glass" ? "on" : ""} type="submit">Стекло</button>
        </form>
        <span className="chip acc">{user.name}</span>
        <span className="chip mut">{user.role.name}</span>
        <form action="/api/auth/logout" method="post">
          <button className="btn" type="submit">Выйти</button>
        </form>
      </header>
      <div id="wrap">
        <nav id="nav">
          {NAV.map(g => {
            const items = g.items.filter(i => canSee(user, i.key));
            if (!items.length) return null;
            return (
              <div key={g.grp}>
                <div className="grp">{g.grp}</div>
                {items.map(i => (
                  <Link key={i.key} href={i.href}><span className="ic">{i.ic}</span>{i.label}</Link>
                ))}
              </div>
            );
          })}
        </nav>
        <main id="main">{children}</main>
      </div>
    </>
  );
}
