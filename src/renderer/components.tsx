import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export { mmss } from '../core/dial';

/** Иконки из макета (линии 24×24, цвет — currentColor). */
const PATHS = {
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  folder: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6.5V12l4 2.5" /></>,
  save: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4" /><path d="M8 20v-6h8v6" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 15, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function PlayIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>;
}

interface Tip { text: string; x: number; y: number; below: boolean }

/**
 * Всплывающие подсказки для всех элементов с data-tip. Подсказка рисуется поверх всего окна,
 * поэтому её не обрезают прокручиваемые контейнеры.
 */
export function TipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    const show = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]');
      if (!el) return setTip(null);
      const r = el.getBoundingClientRect();
      const below = r.top < 40;
      setTip({ text: el.getAttribute('data-tip') ?? '', x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below });
    };
    const hide = () => setTip(null);
    document.addEventListener('mouseover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', hide);
    document.addEventListener('mousedown', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('mouseover', show);
      document.removeEventListener('focusin', show);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('mousedown', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  // Не даём подсказке выйти за край узкого окна.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    const w = el.offsetWidth;
    el.style.left = `${Math.min(Math.max(tip.x - w / 2, 6), window.innerWidth - w - 6)}px`;
  }, [tip]);
  if (!tip?.text) return null;
  return (
    <div ref={ref} className={`tip-layer${tip.below ? ' below' : ''}`} role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  );
}
