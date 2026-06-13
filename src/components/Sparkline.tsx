// Мини-график тренда внутри плитки (как в Shopify/Lemon Squeezy). Чистый SVG, тянется на ширину карточки.
export function Sparkline({ points, color = "var(--acc)" }: { points: number[]; color?: string }) {
  if (!points || points.length < 2) return null;
  const W = 240, H = 40, pad = 3;
  const min = Math.min(...points), max = Math.max(...points), span = (max - min) || 1;
  const iw = W - pad * 2, ih = H - pad * 2;
  const pts = points.map((v, i) => [pad + (i / (points.length - 1)) * iw, pad + (1 - (v - min) / span) * ih] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${(pad + iw).toFixed(1)} ${(pad + ih).toFixed(1)} L${pad.toFixed(1)} ${(pad + ih).toFixed(1)} Z`;
  return (
    <svg className="tile-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path d={area} fill={color} opacity="0.09" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
