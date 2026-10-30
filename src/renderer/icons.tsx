// Иконки панели сессии (из макета Session).

export function BackIcon() {
  return <svg width="22.5" height="22.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 5v14" /><path d="M18 5l-9 7 9 7z" /></svg>;
}

export function ForwardIcon() {
  return <svg width="22.5" height="22.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 5v14" /><path d="M6 5l9 7-9 7z" /></svg>;
}

export function PauseIcon() {
  return <svg width="22.5" height="22.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="6.5" y="5" width="3.5" height="14" rx="1" /><rect x="14" y="5" width="3.5" height="14" rx="1" /></svg>;
}

export function PlayIcon({ size = 22.5 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>;
}

/** Сердце: всегда контуром, лайк показывается цветом кнопки. */
export function HeartIcon() {
  return <svg width="22.5" height="22.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>;
}

/** Палец вниз: дизлайк. */
export function ThumbDownIcon() {
  return <svg width="22.5" height="22.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 14V3" /><path d="M9 18.1L10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-7.8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9z" /></svg>;
}

/** EXIT: человечек выходит в дверь (при наведении уходит в неё). */
export function ExitIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3h6v18h-6" /><g className="exit-man"><circle cx="8" cy="5" r="1.7" /><path d="M8 8l-1.5 5 3 2v5" /><path d="M7.7 9.5L11 11.5h2.5" /><path d="M6.5 13l-2.5 2" /><path d="M6.5 13L5 20" /></g></svg>;
}
