// Серверные UI-компоненты в стиле прототипа
import Link from "next/link";
import { Photo } from "@/components/Photo";

export function Tile(props: {
  label: string; value: string; chip?: { text: string; tone: "ok" | "warn" | "bad" | "mut" };
  rows?: { k: string; v: string }[]; breakdown?: { name: string; value: string }[];
  net?: { k: string; v: string }; selected?: boolean;
}) {
  return (
    <div className={`card tile${props.selected ? " sel" : ""}`}>
      <div className="lbl">
        <span>{props.label}</span>
        {props.chip && <span className={`chip ${props.chip.tone}`}>{props.chip.text}</span>}
      </div>
      <div className="big num">{props.value}</div>
      {props.rows?.map(r => (
        <div className="row" key={r.k}><span>{r.k}</span><b className="num">{r.v}</b></div>
      ))}
      {props.breakdown && props.breakdown.length > 0 && (
        <div className="cab-split">
          {props.breakdown.map(b => (
            <div className="cab-item" key={b.name}>
              <span className="cab-name">{b.name}</span>
              <span className="cab-val num">{b.value}</span>
            </div>
          ))}
        </div>
      )}
      {props.net && <div className="net num"><span>{props.net.k}</span><span>{props.net.v}</span></div>}
    </div>
  );
}

export function Empty({ title, hint, art }: { title: string; hint?: string; art?: React.ReactNode }) {
  return (
    <div className="card empty">
      {art}
      <b>{title}</b>
      {hint && <span className="sm">{hint}</span>}
    </div>
  );
}

export function Tabs({ base, items, current, extraQuery }: {
  base: string; items: { key: string; label: string }[]; current: string; extraQuery?: string;
}) {
  return (
    <div className="tabs">
      {items.map(t => (
        <Link key={t.key} href={`${base}?tab=${t.key}${extraQuery ?? ""}`} className={current === t.key ? "on" : ""}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function StageBar({ stages, current }: { stages: string[]; current: number }) {
  return (
    <div className="stagebar">
      {stages.map((s, i) => (
        <span key={s} style={{ display: "contents" }}>
          <span className={`st${i < current ? " done" : i === current ? " cur" : ""}`}>{s}</span>
          {i < stages.length - 1 && <span className="arr">→</span>}
        </span>
      ))}
    </div>
  );
}

export function Pimg({ url, nmId, size }: { url?: string | null; nmId?: number | bigint; size?: "md" | "lg" }) {
  return <Photo url={url} nmId={nmId === undefined ? undefined : Number(nmId)} size={size} />;
}
