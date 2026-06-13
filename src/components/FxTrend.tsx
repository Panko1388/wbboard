// Мини-график движения курса $ для шапки Пульса. Чистый SVG, без зависимостей.
// points — значения курса по дням в хронологическом порядке (старые → новые).
export function FxTrend({ points, source, width = 116, height = 30 }: {
  points: number[]; source?: string; width?: number; height?: number;
}) {
  if (!points.length) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const deltaPct = first ? ((last - first) / first) * 100 : 0;
  const dir = deltaPct > 0.05 ? "up" : deltaPct < -0.05 ? "down" : "flat";

  let spark: React.ReactNode = null;
  if (points.length >= 2) {
    const min = Math.min(...points), max = Math.max(...points), span = (max - min) || 1;
    const pad = 3, w = width - pad * 2, h = height - pad * 2;
    const pts = points.map((v, i) => [pad + (i / (points.length - 1)) * w, pad + (1 - (v - min) / span) * h] as const);
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area = `${line} L${(pad + w).toFixed(1)} ${(pad + h).toFixed(1)} L${pad.toFixed(1)} ${(pad + h).toFixed(1)} Z`;
    const [lx, ly] = pts[pts.length - 1];
    spark = (
      <svg className="fxspark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        <path d={area} fill="var(--acc)" opacity="0.10" />
        <path d={line} fill="none" stroke="var(--acc)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lx} cy={ly} r="2.3" fill="var(--acc)" />
      </svg>
    );
  }

  return (
    <span className="fxtrend" title={`Курс $${source ? " · " + source : ""}: ${first.toFixed(2)} → ${last.toFixed(2)} ₽ за ${points.length} дн`}>
      <span className="fxtrend-rate num">{last.toFixed(2)} ₽/$</span>
      {spark}
      {dir !== "flat" && (
        <span className={`fxtrend-delta ${dir}`}>{dir === "up" ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}%</span>
      )}
    </span>
  );
}
