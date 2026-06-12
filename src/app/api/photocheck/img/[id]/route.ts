// Отдача загруженного фото (uploads вне public)
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const check = await db.photoCheck.findUnique({ where: { id } });
  if (!check) return new NextResponse("not found", { status: 404 });

  const dir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  const safe = path.basename(check.imagePath);
  try {
    const buf = await readFile(path.join(dir, safe));
    const ext = safe.split(".").pop();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": ext === "png" ? "image/png" : "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("file missing", { status: 404 });
  }
}
