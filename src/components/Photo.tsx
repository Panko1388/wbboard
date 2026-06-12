"use client";
// Фото товара: из БД, иначе перебираем кандидатов CDN WB по nmId; при исчерпании — плейсхолдер.
// Если есть nmId — оборачиваем в ссылку на карточку товара на Wildberries.
import { useState } from "react";
import { wbPhotoCandidates, wbProductUrl } from "@/lib/wbPhoto";

export function Photo({
  url, nmId, size, link = true,
}: { url?: string | null; nmId?: number; size?: "md" | "lg"; link?: boolean }) {
  const candidates = url ? [url] : nmId ? wbPhotoCandidates(nmId) : [];
  const [idx, setIdx] = useState(0);
  const cls = `pimg${size ? ` ${size}` : ""}`;
  const phCls = `ph${size ? ` ${size}` : ""}`;
  const src = candidates[idx];

  const img = !src
    ? <span className={phCls} />
    // eslint-disable-next-line @next/next/no-img-element
    : <img className={cls} src={src} alt="" loading="lazy" onError={() => setIdx(i => i + 1)} />;

  if (link && nmId) {
    return (
      <a href={wbProductUrl(nmId)} target="_blank" rel="noreferrer" className="pimg-link" title="Открыть на Wildberries">
        {img}
      </a>
    );
  }
  return img;
}
