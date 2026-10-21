/**
 * Where the docked panel sits, in one place: the CSS (Panel.tsx) and the room the world makes for it (Experience.tsx) both read this,
 * in rem, so they agree whatever the visitor's text size is.
 */
export const PANEL = { minRem: 26, vw: 38, maxRem: 42, rightRem: 3.5, gapRem: 1.5 } as const;

export const PANEL_WIDTH = `clamp(${PANEL.minRem}rem, ${PANEL.vw}vw, ${PANEL.maxRem}rem)`;

/** The share of a stage `w` px wide that the docked panel, its margin at the right and a gap before it take (`rem` is the root font size in px). */
export function panelInset(w: number, rem: number) {
  const panel = Math.min(PANEL.maxRem * rem, Math.max(PANEL.minRem * rem, (PANEL.vw / 100) * w));
  return (PANEL.rightRem * rem + panel + PANEL.gapRem * rem) / w;
}
