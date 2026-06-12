"use client";
// Переключатель валюты ₽/$ (Пульс). Выбор — в cookie, пересчёт по курсу из FxRate.
export function CurrencySeg({ current, rate }: { current: "rub" | "usd"; rate: number }) {
  const set = (c: string) => {
    document.cookie = `wbboard_cur=${c};path=/;max-age=31536000;samesite=lax`;
    location.reload();
  };
  return (
    <div className="seg" style={{ display: "inline-flex", marginLeft: 10, verticalAlign: "middle" }}
      title={rate > 0 ? `Курс: ${rate.toFixed(2)} ₽/$` : "Курс ещё не собран"}>
      <button className={current === "rub" ? "on" : ""} onClick={() => set("rub")}>₽</button>
      <button className={current === "usd" ? "on" : ""} onClick={() => set("usd")} disabled={rate <= 0}>$</button>
    </div>
  );
}
