// In-house illustrations (no external images): warm, flat, a little architectural. Server-safe.

/** A living room in a Pune flat: arch window, jaali screen, sofa, lamp, plant, rug. */
export function RoomScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 360" className={className} role="img" aria-label="An illustrated living room with a sofa, lamp and plant">
      <defs>
        <linearGradient id="rs-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F3E5D0" /><stop offset="1" stopColor="#E9D3B8" /></linearGradient>
        <linearGradient id="rs-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F6C99A" /><stop offset="1" stopColor="#F9E6C6" /></linearGradient>
        <radialGradient id="rs-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#FFE9B0" stopOpacity=".9" /><stop offset="1" stopColor="#FFE9B0" stopOpacity="0" /></radialGradient>
        <pattern id="rs-jaali" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M9 1 17 9 9 17 1 9Z" fill="none" stroke="#7A4E2D" strokeWidth="1.2" /><circle cx="9" cy="9" r="2" fill="none" stroke="#7A4E2D" strokeWidth="1" /></pattern>
      </defs>
      <rect width="520" height="360" rx="26" fill="url(#rs-wall)" />
      <path d="M70 250V120a60 60 0 0 1 120 0v130z" fill="url(#rs-sky)" stroke="#7A4E2D" strokeWidth="5" />
      <circle cx="130" cy="150" r="22" fill="#F2A36B" opacity=".85" />
      <path d="M70 215c30-14 60-10 120 6v29H70z" fill="#B8573A" opacity=".35" />
      <path d="M130 60v190M70 150h120" stroke="#7A4E2D" strokeWidth="3" />
      <rect x="230" y="70" width="110" height="180" rx="6" fill="#FBF3E4" stroke="#7A4E2D" strokeWidth="4" />
      <rect x="236" y="76" width="98" height="168" fill="url(#rs-jaali)" opacity=".75" />
      <rect x="0" y="250" width="520" height="110" fill="#C9A47E" />
      <rect x="0" y="250" width="520" height="8" fill="#A9835F" />
      <ellipse cx="300" cy="312" rx="190" ry="26" fill="#2F4A6D" opacity=".92" />
      <ellipse cx="300" cy="312" rx="150" ry="19" fill="none" stroke="#D9B45B" strokeWidth="2" strokeDasharray="6 6" />
      <rect x="215" y="206" width="210" height="62" rx="18" fill="#B8573A" />
      <rect x="205" y="226" width="34" height="52" rx="14" fill="#9E4529" /><rect x="401" y="226" width="34" height="52" rx="14" fill="#9E4529" />
      <rect x="236" y="232" width="168" height="38" rx="12" fill="#C9694A" />
      <rect x="250" y="190" width="64" height="44" rx="14" fill="#D9B45B" /><rect x="326" y="194" width="62" height="40" rx="14" fill="#6F8A6E" />
      <rect x="226" y="268" width="10" height="16" rx="3" fill="#5A3A22" /><rect x="404" y="268" width="10" height="16" rx="3" fill="#5A3A22" />
      <circle cx="462" cy="122" r="58" fill="url(#rs-glow)" />
      <path d="M462 140v128" stroke="#5A3A22" strokeWidth="5" strokeLinecap="round" /><ellipse cx="462" cy="270" rx="22" ry="6" fill="#5A3A22" />
      <path d="M438 140 450 96h24l12 44z" fill="#F7E3B0" stroke="#B8913F" strokeWidth="3" strokeLinejoin="round" />
      <path d="M36 268h46l-6 40H42z" fill="#7A4E2D" />
      <path d="M59 268c-26-20-30-52-18-74 18 14 24 44 18 74zM59 268c4-26 22-48 44-56-2 26-18 48-44 56zM59 268c-4-34 2-66 14-86 12 22 8 58-14 86z" fill="#6F8A6E" />
      <path d="M170 0v40" stroke="#5A3A22" strokeWidth="2" /><path d="M150 40h40l-8 24h-24z" fill="#B8913F" />
    </svg>
  );
}

/** Faint architectural line art for the page banners. */
export function ArchLine({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 200" className={className} fill="none" stroke="#D9B45B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 190h280M40 190V86a52 52 0 0 1 104 0v104M92 34v156M40 110h104" />
      <path d="M180 190V70h100v120M180 100h100M230 70v120" />
      <path d="M186 76 274 184M274 76 186 184" opacity=".35" />
      <circle cx="262" cy="40" r="14" opacity=".7" /><path d="M262 14v-6M262 72v-6M236 40h-6M294 40h-6M244 22l-4-4M280 58l4 4M280 22l4-4M244 58l-4 4" opacity=".5" />
    </svg>
  );
}
