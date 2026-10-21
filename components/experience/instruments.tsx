"use client";

import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import type { PanelId } from "@/components/world/story";
import { projects } from "@/data/projects";
import { countWord } from "@/lib/format";

/* ─────────────────────────────────────────────────────────────────────────
   THE INSTRUMENTS — the live things that explain what the world is showing: the sliders, switches and scrubbers of the
   long-form site, brought into the journey. Each is on show beside the world at its stop (see `PANEL_DEFS` in the story
   table); on a narrow screen it opens as a sheet instead. They are the same components the archive uses, loaded when the
   story gets near them and dropped when it moves on.
   ───────────────────────────────────────────────────────────────────────── */

export type Instrument = {
  id: PanelId;
  /** The figure's number or name, set in front of its title ("Fig. 04"). */
  fig: string;
  title: string;
  /** A short tag at the right of the title bar. */
  code?: string;
  /** What you are looking at, in a sentence or two. */
  what: ReactNode;
  /** What to try, for a pointer and for a finger. */
  hint: { fine: string; coarse: string };
  /**
   * How it takes up room: `fill` instruments draw into the box they are given (at least `min` rem tall, the panel
   * scrolls if it is shorter); `auto` ones size themselves.
   */
  size: { fill: number } | "auto";
  /** It draws its own frame and title. */
  bare?: boolean;
  /** Docked, how wide it is (the default is the shared panel width). */
  width?: string;
  Body: LazyExoticComponent<ComponentType>;
};

type Loader = () => Promise<{ default: ComponentType }>;

/** The code for each, so it can be fetched ahead of its stop. */
const loaders: Record<PanelId, Loader> = {
  scan: () => import("./panels/ScanReadout"),
  survey: () => import("./panels/LabPanel"),
  plan: () => import("./panels/PlannerPanel").then((m) => ({ default: m.Fork })),
  sparrow: () => import("../sections/projects/visuals/SparrowVisual"),
  mpt: () => import("./panels/PlannerPanel").then((m) => ({ default: m.Gate })),
  chiron: () => import("./panels/ChironPanel"),
  routem: () => import("../sections/projects/visuals/RouteVisual"),
  oscar: () => import("./panels/OscarPanel"),
  nova: () => import("./panels/NovaPanel"),
  crew: () => import("./panels/CrewPanel"),
  transit: () => import("../sections/research/TransitLab"),
  toolkit: () => import("./panels/SkillsPanel"),
  path: () => import("./panels/TimelinePanel"),
};

const bodies = Object.fromEntries((Object.keys(loaders) as PanelId[]).map((id) => [id, lazy(loaders[id])])) as Record<PanelId, LazyExoticComponent<ComponentType>>;

/** Start fetching a panel's code (a no-op if it has been). */
export function preload(id: PanelId | null) {
  if (id) void loaders[id]();
}

const T = { fine: "", coarse: "" };

const list: Omit<Instrument, "Body">[] = [
  {
    id: "scan",
    fig: "Live",
    title: "Pushbroom LiDAR",
    bare: true,
    width: "22.5rem",
    size: "auto",
    what: "",
    hint: T,
  },
  {
    id: "survey",
    fig: "Trade study",
    title: "Pushbroom lab",
    code: "CSA · LiDAR",
    size: "auto",
    what: "The ground is a LiDAR scan, and a scan is a choice: how fast the rover drives, how the sensor is tilted, how high it sits. This is the CSA trade study as a model. Change them and watch which 3 cm rocks are still seen.",
    hint: { fine: "Drag the sliders · pick a preset · drag the view to orbit", coarse: "Move the sliders · tap a preset · drag the view" },
  },
  {
    id: "plan",
    fig: "Planner",
    title: "Route planner",
    code: "CSA · MPT",
    size: { fill: 46 },
    what: "A made-up crater field and a planner that searches for the cheapest way across while staying under a slope limit: the idea behind the route you just followed. Ask for the safest path, or close a pass.",
    hint: { fine: "Drag pins A and B · Fastest or Safest · try Shadow and Gate", coarse: "Drag pins A and B · Fastest or Safest · try Shadow and Gate" },
  },
  {
    id: "sparrow",
    fig: "Fig. 01",
    title: "Sensor-agnostic mast interface",
    code: "SPARROW",
    size: { fill: 30 },
    what: "Sparrow’s mast takes a LiDAR, a stereo pair or a single camera through one mount plate and connector, with no rework. Swap them to see what each one sees, and what the whole rover costs.",
    hint: { fine: "Pick a sensor · it swaps by itself until you do", coarse: "Tap a sensor · it swaps by itself until you do" },
  },
  {
    id: "mpt",
    fig: "Fig. 02",
    title: "Live route planner",
    code: "MPT",
    size: { fill: 46 },
    what: "The mission-planning tool, as a demo: plan over terrain, shadow and keep-out zones, on a laptop of any spec. Gate is the interesting one: clear the zones and watch the route flip.",
    hint: { fine: "Load Gate · draw a keep-out zone · drag A and B", coarse: "Load Gate · draw a keep-out zone · drag A and B" },
  },
  {
    id: "chiron",
    fig: "Fig. 03",
    title: "Prototype & corridor logic",
    code: "CHIRON",
    size: "auto",
    what: "A hospital robot that follows a corridor line, finds a branch, turns in, reads a room’s colour and delivers the right pill box. The photo is the real prototype; the map is its logic, one decision at a time.",
    hint: { fine: "Watch the State and Decision readouts as it drives", coarse: "Watch the State and Decision readouts as it drives" },
  },
  {
    id: "routem",
    fig: "Fig. 04",
    title: "Mars orbit & coverage",
    code: "ROUTE-M",
    size: { fill: 30 },
    what: "Two orbiters in low Mars orbit, one near-polar and one flying complementary passes, lay down ground track until the whole planet has been imaged at 1 m or better. Spin the planet and watch coverage fill.",
    hint: { fine: "Drag to rotate Mars", coarse: "Drag to rotate Mars" },
  },
  {
    id: "oscar",
    fig: "Fig. 05",
    title: "Ocean-colour spectral response",
    code: "OSCAR",
    size: { fill: 34 },
    what: "OSCAR splits the sunlight that comes back off the sea into narrow bands. Chlorophyll absorbs blue and red, so the shape of the spectrum gives away how much algae is there.",
    hint: { fine: "Hover the scene to sample any pixel", coarse: "Tap the scene to sample a pixel" },
  },
  {
    id: "nova",
    fig: "Fig. 06",
    title: "Ascent profile & qualification",
    code: "NOVA",
    size: { fill: 34 },
    what: "NOVA rode a balloon to 40 km. It had to survive the climb, run on 4 W, and hold a camera steady: the numbers are the power budget, the figures are the analysis and the machined part.",
    hint: { fine: "Watch the altitude climb · the figures are the real analysis", coarse: "Watch the altitude climb · the figures are the real analysis" },
  },
  {
    id: "crew",
    fig: "Leadership",
    title: "Steel bridge & team growth",
    code: "YUSB",
    size: "auto",
    what: "A competition steel bridge, 20 ft span, built by a team that grew from 6 to 20. The experiment: build each member as a small triangular truss instead of a flat bar. Flip between the two.",
    hint: { fine: "Switch the members · watch the team fill", coarse: "Switch the members · watch the team fill" },
  },
  {
    id: "transit",
    fig: "Research",
    title: "Transit lab · HAT-P-18 b",
    code: "PHYS 3070",
    size: "auto",
    what: "706 photographs of one star over six hours. When the planet crosses the star the light dips by 1.7%, and the size of the dip and the length of the crossing give the size of the planet.",
    hint: { fine: "Press play, or scrub the frames", coarse: "Press play, or scrub the frames" },
  },
  {
    id: "toolkit",
    fig: "Skills",
    title: "Four disciplines, one system",
    size: "auto",
    what: "The tools I reach for, grouped the way a spacecraft is. The stars in the sky are the same skills; point at a group and its stars light up there too.",
    hint: { fine: "Hover a group or a skill", coarse: "Tap a group or a skill" },
  },
  {
    id: "path",
    fig: "Timeline",
    title: "Mission timeline",
    size: { fill: 30 },
    what: `Everything on one axis: study, two internships, two design teams, ${countWord(projects.length)} projects and a research paper, overlapping the way real schedules do. The lines beside the route are the same rows.`,
    hint: { fine: "Hover a row to light it up · click to open it", coarse: "Tap a row to open it" },
  },
];

export const instruments: Record<PanelId, Instrument> = Object.fromEntries(list.map((i) => [i.id, { ...i, Body: bodies[i.id] }])) as Record<PanelId, Instrument>;
