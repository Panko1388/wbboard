import { redirect } from "next/navigation";
import { getSessionUser, setSessionCookie, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { DoodleChatBubbles } from "@/components/doodles";

export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const pass = String(formData.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(pass, user.passHash)) {
    redirect("/login?err=1");
  }
  await db.auditLog.create({ data: { userId: user!.id, action: "login" } });
  await setSessionCookie(user!.id);
  redirect("/pulse");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect("/pulse");
  const { err } = await searchParams;

  return (
    <div className="login-wrap">
      <div className="login-bg" />
      {/* плавающие «сообщения» с метриками — эффект чата на светлом фоне */}
      <div className="float-bubble fb1"><span className="dotpulse" />Заказы за сегодня: <b className="num up">+12%</b></div>
      <div className="float-bubble fb2">📦 Выкуп <b className="num">85%</b></div>
      <div className="float-bubble fb3">💰 Прибыль посчитана <b>✓</b></div>
      <div className="float-bubble fb4">📣 ДРР <b className="num ok" style={{ color: "var(--ok)" }}>6,8%</b></div>

      <div className="card login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="WBoard" style={{ height: 44, display: "block", margin: "2px auto 10px" }} />
        <DoodleChatBubbles />
        <p className="sub" style={{ textAlign: "center" }}>Аналитика Wildberries · вход для команды</p>
        {err && <div className="banner">Неверная почта или пароль</div>}
        <form action={login}>
          <input type="email" name="email" placeholder="Почта" required autoFocus />
          <input type="password" name="password" placeholder="Пароль" required />
          <button className="btn acc" type="submit">Войти</button>
        </form>
      </div>
    </div>
  );
}
