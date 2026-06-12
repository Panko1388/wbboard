import { redirect } from "next/navigation";
import { getSessionUser, homePath } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Root() {
  const u = await getSessionUser();
  redirect(u ? homePath(u) : "/login");
}
