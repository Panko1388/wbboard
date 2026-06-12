"use client";
// Переключатель кабинета в шапке: «Все» или конкретный кабинет. Выбор — в cookie,
// влияет на ВСЕ страницы статистики. Перезагружает страницу при смене.
export function CabinetSeg({ cabinets, current }: {
  cabinets: { sid: string; name: string }[];
  current: string;
}) {
  if (cabinets.length < 2) return null; // один кабинет — переключать нечего
  const set = (sid: string) => {
    document.cookie = `wbboard_cab=${sid};path=/;max-age=31536000;samesite=lax`;
    location.reload();
  };
  return (
    <select
      className="cab-select"
      value={current}
      onChange={e => set(e.target.value)}
      title="Кабинет для просмотра статистики"
    >
      <option value="all">Все кабинеты</option>
      {cabinets.map(c => <option key={c.sid} value={c.sid}>{c.name}</option>)}
    </select>
  );
}
