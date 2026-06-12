// Загрузка фото для фото-чека: сохраняем в UPLOAD_DIR, ставим в очередь, обрабатываем
import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { runPhotoCheck } from "@/lib/photocheck/pipeline";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const fd = await req.formData();
  const file = fd.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "file too large" }, { status: 400 });

  const dir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  await mkdir(dir, { recursive: true });
  // whitelist расширений: html/svg/прочее не сохраняем (аудит #26)
  const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ext = ["jpg", "jpeg", "png", "webp"].includes(rawExt) ? rawExt : "jpg";
  const name = `pc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

  const check = await db.photoCheck.create({
    data: { userId: user.id, imagePath: name },
  });
  // обрабатываем сразу (мок быстрый); живой пайплайн подхватит воркер по расписанию
  runPhotoCheck(check.id).catch(console.error);

  return NextResponse.json({ id: check.id });
}
