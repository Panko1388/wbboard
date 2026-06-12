import Link from "next/link";
import { PERIODS, type PeriodKey } from "@/lib/period";

// Переключатель периода. Выбор живёт только в URL текущей страницы (?p=),
// между страницами НЕ переносится — при переходе всегда дефолт страницы.
export function PeriodSeg({ base, current, extraQuery }: { base: string; current: PeriodKey; extraQuery?: string }) {
  return (
    <div className="seg" style={{ display: "inline-flex", marginBottom: 20 }}>
      {PERIODS.map(p => (
        <Link
          key={p.key}
          href={`${base}?p=${p.key}${extraQuery ?? ""}`}
          className={current === p.key ? "on" : ""}
          title={p.hint}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
