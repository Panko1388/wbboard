// Выход: чистим cookie и отвечаем 303 (See Other) с относительным Location —
// 307 нельзя: браузер повторил бы POST на /login и получил 405.
import { NextResponse } from "next/server";

export async function POST() {
  const res = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  res.cookies.set("wbboard_session", "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
  return res;
}
