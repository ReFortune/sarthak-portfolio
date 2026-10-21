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
  { id: "survey", section: "experience", weight: 1.5, hold: 0.62 },
  { id: "plan", section: "experience", weight: 1.5, hold: 0.62 },
  { id: "gate2", section: "experience", weight: 1.4, hold: 0.1 },
  { id: "sparrow", section: "projects", weight: 1.25, hold: 0.62 },
  { id: "mpt", section: "projects", weight: 1.25, hold: 0.62 },
  { id: "chiron", section: "projects", weight: 1.25, hold: 0.62 },
  { id: "routem", section: "projects", weight: 1.25, hold: 0.62 },
  { id: "oscar", section: "projects", weight: 1.25, hold: 0.62 },
  { id: "nova", section: "projects", weight: 1.25, hold: 0.62 },
  { id: "ascent", section: "projects", weight: 1.2, hold: 0 },
  { id: "crew", section: "leadership", weight: 1.5, hold: 0.62 },
  { id: "transit", section: "research", weight: 1.5, hold: 0.62 },
  { id: "toolkit", section: "toolkit", weight: 1.5, hold: 0.62 },
  { id: "descent", section: "toolkit", weight: 1.3, hold: 0 },
  { id: "path", section: "timeline", weight: 2.2, hold: 0.3 },
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

/* ─────────────────────────────────────────────────────────────────────────
   THE INSTRUMENT PANELS — a live instrument sits beside the world at the stops that have one (a slider to move, a
   switch to flip, a scrubber to drag). Each is on show over a stretch of the story; while it is, on a wide screen the
   picture shifts over to make room for it.
   ───────────────────────────────────────────────────────────────────────── */

export type PanelId =
  | "scan" | "about" | "survey" | "plan" | "sparrow" | "mpt" | "chiron" | "routem" | "oscar" | "nova"
  | "crew" | "transit" | "toolkit" | "path";

type PanelDef = {
  id: PanelId;
  beat: BeatId;
  /** Where it comes on and goes off, in beats from the start of `beat` (so `0.5` is half-way through it). */
  from: number;
  to: number;
  /** Whether the picture moves over to make room for it. */
  shift: boolean;
};

const held = (id: BeatId) => {
  const b = BEAT_DEFS.find((d) => d.id === id)!;
  return b.hold;
};

export const PANEL_DEFS: PanelDef[] = [
  // the sensor's own readout over the first two stops, then who is behind it
  { id: "scan", beat: "threshold", from: 0.22, to: 1.9, shift: false },
  { id: "about", beat: "why", from: -0.04, to: held("why") + 0.04, shift: true },
  { id: "survey", beat: "survey", from: 0.04, to: 0.96, shift: true },
  { id: "plan", beat: "plan", from: 0.04, to: 0.96, shift: true },
  // the camera is at each pose of the ring for the first `hold` of its beat
  { id: "sparrow", beat: "sparrow", from: -0.04, to: held("sparrow") + 0.05, shift: true },
  { id: "mpt", beat: "mpt", from: -0.04, to: held("mpt") + 0.05, shift: true },
  { id: "chiron", beat: "chiron", from: -0.04, to: held("chiron") + 0.05, shift: true },
  { id: "routem", beat: "routem", from: -0.04, to: held("routem") + 0.05, shift: true },
  { id: "oscar", beat: "oscar", from: -0.04, to: held("oscar") + 0.05, shift: true },
  { id: "nova", beat: "nova", from: -0.04, to: held("nova") + 0.05, shift: true },
  { id: "crew", beat: "crew", from: -0.04, to: held("crew") + 0.05, shift: true },
  { id: "transit", beat: "transit", from: -0.04, to: held("transit") + 0.05, shift: true },
  { id: "toolkit", beat: "toolkit", from: -0.04, to: held("toolkit") + 0.05, shift: true },
  { id: "path", beat: "path", from: 0.05, to: 0.95, shift: true },
];

export type Panel = PanelDef & { x0: number; x1: number };
export const panels: Panel[] = PANEL_DEFS.map((p) => {
  const k = beatIndex(p.beat);
  return { ...p, x0: k + p.from, x1: k + p.to };
});

/** How softly a panel comes on and goes off, in beats. */
const PANEL_EDGE = 0.1;
/** The picture starts making room a little before its panel arrives, and holds the room between two panels in a row. */
const PANEL_ROOM = 0.34;

/** Which panel is on show at story position `x` (beat + fraction) and how fully (0–1). */
export function panelAt(x: number): { id: PanelId | null; env: number } {
  let id: PanelId | null = null, env = 0;
  for (const p of panels) {
    const e = smooth((x - p.x0) / PANEL_EDGE) * (1 - smooth((x - p.x1) / PANEL_EDGE));
    if (e > env) { env = e; id = p.id; }
  }
  return { id: env > 0.001 ? id : null, env };
}

/** How far the picture has moved over to make room for a panel (0–1). */
export function roomAt(x: number): number {
  let r = 0;
  for (const p of panels) {
    if (!p.shift) continue;
    const e = smooth((x - (p.x0 - PANEL_ROOM)) / PANEL_EDGE) * (1 - smooth((x - (p.x1 + PANEL_ROOM)) / PANEL_EDGE));
    if (e > r) r = e;
  }
  return r;
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** The wide layout, with the panel docked beside the world. (CSS uses the same query as the `dock:` variant.) */
export const DOCK_QUERY = "(min-width: 1000px) and (min-aspect-ratio: 6/5) and (min-height: 500px)";

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
