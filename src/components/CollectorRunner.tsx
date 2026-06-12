"use client";
// Кнопки ручного запуска коллекторов с живым обновлением «Последних запусков».
// Сбор идёт в фоне и может длиться до ~2 мин (запросы к WB разнесены из-за лимитов),
// поэтому список обновляем по таймеру, не дожидаясь ручного refresh страницы.
import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { runCollectorNow } from "@/app/actions";

export function CollectorRunner({ collectors }: { collectors: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (ivRef.current) clearInterval(ivRef.current); }, []);

  const run = useCallback((name: string) => {
    if (busy) return;
    setBusy(name);
    // живое обновление списка, пока коллектор работает в фоне
    if (ivRef.current) clearInterval(ivRef.current);
    ivRef.current = setInterval(() => router.refresh(), 3000);

    const fd = new FormData();
    fd.set("name", name);
    runCollectorNow(fd).finally(() => {
      router.refresh();
      setTimeout(() => router.refresh(), 1500); // поймать финальный статус
      setTimeout(() => {
        if (ivRef.current) { clearInterval(ivRef.current); ivRef.current = null; }
        setBusy(null);
      }, 4000);
    });
  }, [busy, router]);

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      {collectors.map(c => (
        <button
          key={c}
          type="button"
          className={`btn${busy === c ? " acc" : ""}`}
          disabled={busy !== null}
          onClick={() => run(c)}
        >
          {busy === c ? `${c} — идёт…` : c}
        </button>
      ))}
      {busy && (
        <span className="chip warn">
          сбор «{busy}» может идти до ~2 мин — список обновляется сам
        </span>
      )}
    </div>
  );
}
