// Рисованные иллюстрации в стиле callibri: «чернильные» неровные обводки,
// круглые концы линий, лёгкие заливки. Все цвета — через CSS-переменные.
const ink = "var(--ink, #2b2350)";
const acc = "var(--acc)";
const soft = "var(--acc-soft)";
const amber = "#f4b860";

function Svg({ children, w = 150, h = 110, label }: { children: React.ReactNode; w?: number; h?: number; label?: string }) {
  return (
    <svg className="doodle" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}
      fill="none" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** Растущий график со стрелкой и искрами — пустые состояния аналитики */
export function DoodleChart() {
  return (
    <Svg label="график растёт">
      <path d="M14 96 Q13 97 15 97 L132 96" stroke={ink} strokeWidth="3" />
      <path d="M16 95 L17 22 Q16.5 20 17.5 22" stroke={ink} strokeWidth="3" />
      <rect x="30" y="64" width="14" height="31" rx="3" fill={soft} stroke={ink} strokeWidth="2.5" transform="rotate(-1 37 79)" />
      <rect x="56" y="48" width="14" height="47" rx="3" fill={amber} opacity="0.85" stroke={ink} strokeWidth="2.5" transform="rotate(1 63 71)" />
      <rect x="82" y="30" width="14" height="65" rx="3" fill={acc} opacity="0.8" stroke={ink} strokeWidth="2.5" transform="rotate(-1 89 62)" />
      <path d="M28 58 Q55 47 70 38 Q90 26 112 16" stroke={ink} strokeWidth="3" strokeDasharray="1 6" />
      <path d="M104 14 L114 14 Q116 14 115 16 L113 25" stroke={ink} strokeWidth="3" />
      <path d="M124 30 l3 -7 M130 38 l6 -3 M122 44 l5 2" stroke={amber} strokeWidth="3" />
    </Svg>
  );
}

/** Коробки склада со стрелкой-циклом — остатки и поставки */
export function DoodleBoxes() {
  return (
    <Svg label="коробки на складе">
      <rect x="22" y="56" width="38" height="36" rx="4" fill={soft} stroke={ink} strokeWidth="2.5" transform="rotate(-1.5 41 74)" />
      <path d="M22 70 L60 69 M41 57 L41 91" stroke={ink} strokeWidth="2" opacity="0.65" />
      <rect x="64" y="50" width="40" height="42" rx="4" fill="#fff" stroke={ink} strokeWidth="2.5" transform="rotate(1 84 71)" />
      <path d="M64 66 L104 64" stroke={ink} strokeWidth="2" opacity="0.65" />
      <path d="M78 58 Q84 53 90 58" stroke={amber} strokeWidth="3" />
      <rect x="44" y="22" width="34" height="30" rx="4" fill={amber} opacity="0.85" stroke={ink} strokeWidth="2.5" transform="rotate(-2 61 37)" />
      <path d="M52 36 Q60 31 69 36" stroke={ink} strokeWidth="2.5" />
      <path d="M112 84 Q132 76 126 56 Q122 44 110 40" stroke={acc} strokeWidth="3" strokeDasharray="2 7" />
      <path d="M114 46 L108 39 L117 36" stroke={acc} strokeWidth="3" />
    </Svg>
  );
}

/** Лупа над карточкой товара — аналитика рынка */
export function DoodleScope() {
  return (
    <Svg label="поиск ниши">
      <rect x="20" y="26" width="52" height="66" rx="6" fill="#fff" stroke={ink} strokeWidth="2.5" transform="rotate(-2 46 59)" />
      <rect x="27" y="33" width="38" height="28" rx="4" fill={soft} stroke={ink} strokeWidth="2" transform="rotate(-2 46 47)" />
      <path d="M28 70 L58 68 M28 78 L50 76" stroke={ink} strokeWidth="2.5" opacity="0.7" />
      <circle cx="92" cy="48" r="24" fill="#fff" fillOpacity="0.65" stroke={acc} strokeWidth="3.5" />
      <path d="M108 66 Q118 76 124 84 Q126 87 123 88 Q120 89 117 85 Q111 77 104 70" fill={acc} stroke={acc} strokeWidth="2" />
      <path d="M82 44 Q90 36 100 42" stroke={acc} strokeWidth="2.5" />
      <path d="M128 22 l4 -6 M136 32 l7 -2 M130 42 l5 3" stroke={amber} strokeWidth="3" />
    </Svg>
  );
}

/** Фотоаппарат со вспышкой — фото-чек */
export function DoodleCam() {
  return (
    <Svg label="фото товара">
      <rect x="30" y="38" width="88" height="54" rx="9" fill="#fff" stroke={ink} strokeWidth="3" transform="rotate(-1 74 65)" />
      <path d="M56 38 L62 26 Q63 24 65 24 L86 24 Q88 24 89 26 L94 38" fill={soft} stroke={ink} strokeWidth="3" />
      <circle cx="74" cy="64" r="17" fill={soft} stroke={ink} strokeWidth="3" />
      <circle cx="74" cy="64" r="8" fill={acc} opacity="0.85" stroke={ink} strokeWidth="2" />
      <circle cx="106" cy="50" r="3.5" fill={amber} stroke={ink} strokeWidth="1.5" />
      <path d="M22 30 l-6 -8 M20 44 l-9 -1 M118 16 l5 -7 M126 24 l8 -3" stroke={amber} strokeWidth="3" />
    </Svg>
  );
}

/** Монеты и купюра — финансы */
export function DoodleCoins() {
  return (
    <Svg label="деньги">
      <rect x="24" y="40" width="64" height="38" rx="6" fill={soft} stroke={ink} strokeWidth="2.5" transform="rotate(-3 56 59)" />
      <circle cx="56" cy="58" r="11" fill="#fff" stroke={ink} strokeWidth="2.5" transform="rotate(-3 56 58)" />
      <path d="M53 52 L53 64 M50 64 L58 64 M50 58 L58 58" stroke={ink} strokeWidth="2.5" transform="rotate(-3 56 58)" />
      <circle cx="104" cy="70" r="15" fill={amber} opacity="0.9" stroke={ink} strokeWidth="2.5" />
      <circle cx="116" cy="46" r="12" fill="#fff" stroke={ink} strokeWidth="2.5" />
      <path d="M101 64 Q104 62 107 64 M100 70 L108 70 M104 64 L104 77" stroke={ink} strokeWidth="2.5" />
      <path d="M113 41 L113 51 M110 51 L119 51 M110 46 L119 46" stroke={ink} strokeWidth="2" />
      <path d="M30 24 q4 -6 8 0 q4 6 8 0" stroke={acc} strokeWidth="2.5" />
    </Svg>
  );
}

/** Пузыри чата — логин и отчёты */
export function DoodleChatBubbles() {
  return (
    <Svg label="чат" w={160} h={120}>
      <path d="M22 30 Q20 18 34 17 L86 15 Q98 15 98 27 L98 48 Q98 59 86 59 L48 60 L32 72 L36 60 Q22 60 22 49 Z"
        fill="#fff" stroke={ink} strokeWidth="3" />
      <path d="M34 32 L84 30 M34 42 L72 41" stroke={ink} strokeWidth="2.5" opacity="0.65" />
      <path d="M70 70 Q70 60 82 59 L128 58 Q140 58 140 69 L140 86 Q140 96 129 96 L120 97 L128 108 L106 97 L82 98 Q70 98 70 88 Z"
        fill={acc} opacity="0.9" stroke={ink} strokeWidth="3" />
      <circle cx="90" cy="78" r="3.5" fill="#fff" />
      <circle cx="104" cy="78" r="3.5" fill="#fff" />
      <circle cx="118" cy="78" r="3.5" fill="#fff" />
      <path d="M120 30 l5 -8 M132 38 l8 -2 M124 46 l6 4" stroke={amber} strokeWidth="3" />
    </Svg>
  );
}

/** Коробка-маскот с глазами — 404 и ошибки */
export function DoodleBoxMascot() {
  return (
    <Svg label="растерянная коробка" w={150} h={120}>
      <rect x="40" y="38" width="70" height="60" rx="7" fill={amber} opacity="0.9" stroke={ink} strokeWidth="3" transform="rotate(-2 75 68)" />
      <path d="M40 56 L110 53" stroke={ink} strokeWidth="2.5" />
      <path d="M40 40 L26 28 M110 37 L124 24" stroke={ink} strokeWidth="3" />
      <circle cx="62" cy="72" r="4" fill={ink} />
      <circle cx="90" cy="70" r="4" fill={ink} />
      <path d="M68 84 Q75 80 82 83" stroke={ink} strokeWidth="3" />
      <path d="M120 60 Q132 58 134 68" stroke={acc} strokeWidth="3" strokeDasharray="2 6" />
      <text x="126" y="52" fontSize="18" fill={ink} fontFamily="inherit">?</text>
    </Svg>
  );
}
