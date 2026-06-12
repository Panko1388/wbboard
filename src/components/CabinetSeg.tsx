"use client";
// Переключатель кабинета — заметный сегмент в шапке: «Все» + кнопка на каждый кабинет.
// Влияет на ВСЕ страницы статистики. Выбор в cookie, перезагружает страницу.
export function CabinetSeg({ cabinets, current }: {
  cabinets: { sid: string; name: string }[];
  current: string;
}) {
  if (cabinets.length < 2) return null; // один кабинет — переключать нечего
  const set = (sid: string) => {
    document.cookie = `wbboard_cab=${sid};path=/;max-age=31536000;samesite=lax`;
    location.reload();
  };
  const short = (n: string) => (n.length > 14 ? n.slice(0, 13) + "…" : n);
  return (
    <div className="seg cab-seg" title="Кабинет для просмотра статистики">
      <button className={current === "all" ? "on" : ""} onClick={() => set("all")}>Все</button>
      {cabinets.map(c => (
        <button key={c.sid} className={current === c.sid ? "on" : ""} onClick={() => set(c.sid)}>{short(c.name)}</button>
      ))}
    </div>
  );
}
