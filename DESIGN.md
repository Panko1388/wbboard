# WBboard — дизайн-система

Все токены — в `src/app/globals.css` (`:root` + оверрайды `[data-theme="glass"]`).

## Темы

- **«Стекло»** (дефолт, выбор Андре): Apple Liquid Glass — цветные блобы под матовыми
  rgba-панелями, `backdrop-filter: blur(22px) saturate(170%)`, блик `inset 0 1px 0 #fff`, r=18px.
- **«Гелий»** (переключатель в шапке): по мотивам Helium 10 — крем `#f7f4ed`, navy `#101b3e`,
  электрик `#2b59ff`, дуотон-градиент `→ #6d3df5`.
- Переключение: cookie `wbboard_theme`, server action `setTheme`, `data-theme` на `<html>`.

## Типографика (register: product)

- Одна семья: **Inter Variable** (self-hosted, `@fontsource-variable/inter/wght.css`, кириллица в комплекте).
- Фиксированная шкала: 12 caption · 13 secondary · 15 body · 17 h2 · 24 h1 · 26 tile-числа.
- Веса по ролям: 400 текст · 600 лейблы/кнопки · 700 h2 · 800 h1 и большие числа. Других не вводить.
- Числа в данных: `.num` → `tabular-nums`.

## Спейсинг и контролы

- Шкала 4pt: 4/8/12/16/20/24/32; группы кнопок — gap 10–12px; секции h2 — 32px сверху.
- Все контролы (кнопки `.btn`, инпуты, select) — **min-height 38px**, радиус 12px (кнопки — пилюли 99px).
- `.seg` — сегментированный переключатель, элементы min-height 32px.
- Карточки `.card` padding 18×20, гриды gap 16; `#main` 28×32, max-width 1340.
- Читаемость: `.alert` max-width 760px, `.banner` 860px, `.sub` 75ch.

## Фирменные элементы

- «Эффекты чата» (от eyenewton): float-пузыри на логине, чат-алерты с аватаркой `W`, каскадный `fadeUp`.
- Рисованные доодлы (от callibri): `src/components/doodles.tsx`, чернила `var(--ink)`, акцент `var(--acc)`, янтарь `#f4b860`.
- Логотип: `public/logo.svg` (W + график роста + «board»), фавиконы `src/app/icon.png`, `apple-icon.png`.
- Фото товаров: CDN WB по nmId (`src/lib/wbPhoto.ts`) c fallback-плейсхолдером.

## Правила

- Тёмный фон не использовать (решение Андре). Светлые темы only.
- Motion: 150–250ms, ease-out; всё отключается под `prefers-reduced-motion`.
- RBAC-видимость денег: уровень B — без ₽ и COGS, C — только операционка; гейты на страницах и в actions.
