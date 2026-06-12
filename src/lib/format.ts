// Форматирование чисел в стиле прототипа
export const fmtRub = (v: number, frac = 0) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: frac }).format(v) + " ₽";

export const fmtNum = (v: number, frac = 0) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: frac }).format(v);

export const fmtPct = (v: number, frac = 1) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: frac }).format(v * 100) + "%";

export const signed = (v: number, fmt: (n: number) => string = fmtNum) =>
  (v > 0 ? "+" : "") + fmt(v);

export const dShort = (d: Date) =>
  d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });

export const dIso = (d: Date) => d.toISOString().slice(0, 10);
