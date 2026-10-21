import { sections } from "@/data/profile";

/* ─────────────────────────────────────────────────────────────────────────
   THE STORY — the one table the DOM and the world both read.

   The home page is a single journey: one scroll, one continuous 3D world. Each beat is a stretch of that scroll
   (`weight` × 100 svh). The ten menu sections each own a run of beats, so the existing menu, quick links and HUD
   keep working: a section's anchor sits where its first beat begins.
   ───────────────────────────────────────────────────────────────────────── */

export type SectionId = (typeof sections)[number]["id"];

export type BeatId =
  | "threshold" | "gate1" | "why" | "survey" | "plan" | "gate2"
  | "sparrow" | "mpt" | "chiron" | "routem" | "oscar" | "nova" | "ascent"
  | "crew" | "transit" | "toolkit" | "descent" | "path" | "resume" | "gate";

type BeatDef = {
  id: BeatId;
  section: SectionId;
  /** Length of the beat in viewport heights. */
  weight: number;
  /** Share of the beat spent holding its pose (so the copy can be read) before the camera moves on to the next beat's. */
  hold: number;
};

export const BEAT_DEFS: BeatDef[] = [
  { id: "threshold", section: "top", weight: 1.4, hold: 0.75 },
  { id: "gate1", section: "top", weight: 1.0, hold: 0 },
  { id: "why", section: "profile", weight: 1.3, hold: 0.65 },
  { id: "survey", section: "experience", weight: 1.2, hold: 0.6 },
  { id: "plan", section: "experience", weight: 1.2, hold: 0.6 },
  { id: "gate2", section: "experience", weight: 1.4, hold: 0.1 },
  { id: "sparrow", section: "projects", weight: 1.0, hold: 0.6 },
  { id: "mpt", section: "projects", weight: 1.0, hold: 0.6 },
  { id: "chiron", section: "projects", weight: 1.0, hold: 0.6 },
  { id: "routem", section: "projects", weight: 1.0, hold: 0.6 },
  { id: "oscar", section: "projects", weight: 1.0, hold: 0.6 },
  { id: "nova", section: "projects", weight: 1.0, hold: 0.6 },
  { id: "ascent", section: "projects", weight: 1.2, hold: 0 },
  { id: "crew", section: "leadership", weight: 1.3, hold: 0.6 },
  { id: "transit", section: "research", weight: 1.3, hold: 0.6 },
  { id: "toolkit", section: "toolkit", weight: 1.3, hold: 0.6 },
  { id: "descent", section: "toolkit", weight: 1.3, hold: 0 },
  { id: "path", section: "timeline", weight: 1.8, hold: 0.2 },
  { id: "resume", section: "resume", weight: 1.1, hold: 0.6 },
  { id: "gate", section: "contact", weight: 1.4, hold: 0.5 },
];

export type Beat = BeatDef & {
  index: number;
  /** Scroll progress (0–1) at which the beat begins and ends. */
  u0: number;
  u1: number;
};

const total = BEAT_DEFS.reduce((n, b) => n + b.weight, 0);
/** The whole journey, in viewport heights. */
export const TOTAL_SVH = total * 100;

export const beats: Beat[] = (() => {
  let acc = 0;
  return BEAT_DEFS.map((b, index) => {
    const u0 = acc / total;
    acc += b.weight;
    return { ...b, index, u0, u1: acc / total };
  });
})();

export const beatIndex = (id: BeatId) => beats.findIndex((b) => b.id === id);

/** Which beat a scroll position is in, and how far through it (0–1). */
export function beatAt(u: number): { index: number; local: number } {
  const x = Math.min(0.999999, Math.max(0, u));
  let lo = 0, hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (beats[mid].u0 <= x) lo = mid;
    else hi = mid - 1;
  }
  const b = beats[lo];
  return { index: lo, local: (x - b.u0) / (b.u1 - b.u0) };
}

/**
 * The distance scrolled over the whole story, in svh: the track is `TOTAL_SVH` tall, but its sticky stage fills the
 * last 100 svh of it, so progress `u` runs over `TOTAL_SVH - 100`.
 */
export const SCROLL_SVH = TOTAL_SVH - 100;

/**
 * Where each menu section sits on the scroll track, in svh: the DOM places an anchor (and the HUD's range) there.
 * A link lands a little way into the section's first beat (the pose is held and its words are up), not on its edge,
 * where the camera is still arriving and the words have yet to appear.
 */
export const LAND = 0.2;
export const sectionRanges: { id: SectionId; start: number; length: number }[] = (() => {
  const starts = sections.map((s) => {
    const first = beats.find((b) => b.section === s.id)!;
    return (s.id === "top" ? first.u0 : first.u0 + (first.u1 - first.u0) * LAND) * SCROLL_SVH;
  });
  // each runs on to where the next begins (the last, to the end of the track), so some section is always the current one
  return sections.map((s, i) => ({ id: s.id, start: starts[i], length: (i + 1 < starts.length ? starts[i + 1] : TOTAL_SVH) - starts[i] }));
})();

/** Scroll progress at the start of a beat (for jumping to it). */
export const uOfBeat = (id: BeatId) => beats[beatIndex(id)].u0;

/** The project each exhibit in the ring stands for (what its dossier opens on). */
export const EXHIBIT_PROJECT: Record<string, string> = {
  sparrow: "sparrow",
  mpt: "mission-planning-tool",
  chiron: "hospital-dispensing-robot",
  routem: "route-m",
  oscar: "oscar",
  nova: "nova-payload",
};

/** The beats a visitor can jump to from the rail (the ones that carry words), with the name each is known by. */
export const RAIL: { id: BeatId; label: string }[] = [
  { id: "threshold", label: "Start" },
  { id: "why", label: "About" },
  { id: "survey", label: "Survey" },
  { id: "plan", label: "Plan" },
  { id: "sparrow", label: "Sparrow" },
  { id: "mpt", label: "MPT" },
  { id: "chiron", label: "Chiron" },
  { id: "routem", label: "Route-M" },
  { id: "oscar", label: "Oscar" },
  { id: "nova", label: "Nova" },
  { id: "crew", label: "Leadership" },
  { id: "transit", label: "Research" },
  { id: "toolkit", label: "Skills" },
  { id: "path", label: "Timeline" },
  { id: "resume", label: "Résumé" },
  { id: "gate", label: "Contact" },
];
