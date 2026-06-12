// Фото и ссылка на карточку WB по nmId.
// Хост CDN (basket-NN) зависит от vol и со временем растёт — поэтому возвращаем
// НЕСКОЛЬКО кандидатов (вычисленный хост + соседние), а <Photo> перебирает их при ошибке.

function basketOf(vol: number): number {
  const t: [number, number][] = [
    [143, 1], [287, 2], [431, 3], [719, 4], [1007, 5], [1061, 6], [1115, 7], [1169, 8],
    [1313, 9], [1601, 10], [1655, 11], [1919, 12], [2045, 13], [2189, 14], [2405, 15],
    [2621, 16], [2837, 17], [3053, 18], [3269, 19], [3485, 20], [3701, 21], [3917, 22],
    [4133, 23], [4349, 24], [4565, 25], [4877, 26], [5193, 27], [5509, 28], [5825, 29],
    [6141, 30], [6457, 31], [6773, 32], [7089, 33], [7405, 34], [7721, 35],
  ];
  for (const [max, b] of t) if (vol <= max) return b;
  return 36;
}

/** Список URL-кандидатов фото: основной хост и соседние (страховка на границах диапазонов) */
export function wbPhotoCandidates(nmId: number, size: "c246x328" | "big" = "c246x328"): string[] {
  const vol = Math.floor(nmId / 1e5);
  const part = Math.floor(nmId / 1e3);
  const base = basketOf(vol);
  const order = [base, base + 1, base - 1, base + 2, base - 2].filter(b => b >= 1);
  const uniq = [...new Set(order)];
  return uniq.map(b =>
    `https://basket-${String(b).padStart(2, "0")}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/${size}/1.webp`);
}

/** Первый кандидат — для обратной совместимости */
export function wbPhotoUrl(nmId: number, size: "c246x328" | "big" = "c246x328"): string {
  return wbPhotoCandidates(nmId, size)[0];
}

/** Ссылка на карточку товара на сайте Wildberries */
export function wbProductUrl(nmId: number): string {
  return `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`;
}
