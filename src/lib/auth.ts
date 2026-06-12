// Auth: пароль — scrypt; сессия — подписанный HMAC-токен в httpOnly cookie.
// RBAC: Role.modules (список страниц) × Role.moneyLevel (A/B/C) × User.cabinets.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

const COOKIE = "wbboard_session";
const TTL_S = 60 * 60 * 24 * 14; // 14 дней

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    // fail-fast: молчаливый dev-фолбэк в проде = подделка сессий
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET не задан — отказ запуска в production");
    return "dev-only-secret-change-me";
  }
  return s;
}

// ── пароли ──────────────────────────────────────────────
export function hashPassword(pass: string): string {
  const salt = randomBytes(16).toString("hex");
  const h = scryptSync(pass, salt, 64).toString("hex");
  return `${salt}:${h}`;
}

export function verifyPassword(pass: string, stored: string): boolean {
  const [salt, h] = stored.split(":");
  if (!salt || !h) return false;
  const a = scryptSync(pass, salt, 64);
  const b = Buffer.from(h, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── сессии ──────────────────────────────────────────────
type SessionPayload = { uid: string; exp: number };

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function makeSessionToken(uid: string): string {
  const body = Buffer.from(JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + TTL_S })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function parseSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    return p.exp > Date.now() / 1000 ? p : null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(uid: string) {
  (await cookies()).set(COOKIE, makeSessionToken(uid), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: TTL_S, path: "/",
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

export type SessionUser = {
  id: string; email: string; name: string;
  role: { name: string; modules: string[]; moneyLevel: "A" | "B" | "C" };
  cabinets: string[]; // пусто = все
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  const p = parseSessionToken(token);
  if (!p) return null;
  const u = await db.user.findUnique({ where: { id: p.uid }, include: { role: true } });
  if (!u) return null;
  return {
    id: u.id, email: u.email, name: u.name,
    role: { name: u.role.name, modules: u.role.modules, moneyLevel: u.role.moneyLevel },
    cabinets: u.cabinets,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

export function canSee(u: SessionUser, module: string): boolean {
  return u.role.modules.includes("*") || u.role.modules.includes(module);
}

/** A — все деньги; B — маржа % без ₽ прибыли и COGS; C — только операционка */
export function moneyLevel(u: SessionUser): "A" | "B" | "C" {
  return u.role.moneyLevel;
}

const MODULE_PATHS: [string, string][] = [
  ["pulse", "/pulse"], ["rnp", "/rnp"], ["pnl", "/pnl"], ["products", "/products"],
  ["adv", "/adv"], ["stocks", "/stocks"], ["market", "/market"], ["promo", "/promo"],
  ["fin", "/fin"], ["settings", "/settings"], ["photocheck", "/photocheck"],
];

/** Первый доступный модуль роли — куда отправлять с «/» и при отказе в доступе */
export function homePath(u: SessionUser): string {
  for (const [m, p] of MODULE_PATHS) if (canSee(u, m)) return p;
  return "/login";
}

/** Страничный гейт: пользователь должен видеть модуль (иначе — на свою домашнюю) */
export async function requireModule(module: string): Promise<SessionUser> {
  const u = await requireUser();
  if (!canSee(u, module)) redirect(homePath(u));
  return u;
}

/** Гейт для server actions: модуль и/или уровень денег. Бросает Error. */
export function assertCan(u: SessionUser, opts: { module?: string; levelA?: boolean }) {
  if (opts.module && !canSee(u, opts.module)) throw new Error(`Недостаточно прав: модуль ${opts.module}`);
  if (opts.levelA && u.role.moneyLevel !== "A") throw new Error("Недостаточно прав: финансовый уровень A");
}

/** Скоупинг кабинета: пустой список у пользователя = все кабинеты */
export function assertCabinet(u: SessionUser, cabinetSid: string) {
  if (u.cabinets.length && !u.cabinets.includes(cabinetSid)) {
    throw new Error("Недостаточно прав: чужой кабинет");
  }
}

/** Выбор кабинета для просмотра (cookie wbboard_cab): «all» или конкретный sid в рамках прав.
 *  Возвращает список для запросов: [] = все доступные пользователю кабинеты. */
export function cabinetScope(u: SessionUser, picked?: string): string[] {
  if (picked && picked !== "all" && (u.cabinets.length === 0 || u.cabinets.includes(picked))) {
    return [picked];
  }
  return u.cabinets; // [] разворачивается в «все активные» (scopedCabinets)
}
