import { GW, type KeepOut, type Objective } from "./plannerEngine";

export type Overlay = "none" | "slope" | "sun";

export type Scenario = {
  id: "fork" | "shadow" | "gate";
  label: string;
  /** What to notice — one line under the controls. */
  note: string;
  /** Cell coordinates (column, row). */
  start: [number, number];
  goal: [number, number];
  zones: KeepOut[];
  objective: Objective;
  requireLight: boolean;
  departFrame: number;
  overlay: Overlay;
};

export const cellOf = ([x, y]: [number, number]) => y * GW + x;

/**
 * Three starting points, tuned against the engine so each one shows something different. Zone positions are metres
 * on the 1,050 × 700 m patch.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: "fork",
    label: "Fork",
    note: "Fastest cuts through the middle; Safest gives the steep walls room.",
    start: [12, 28],
    goal: [160, 92],
    zones: [],
    objective: "fastest",
    requireLight: false,
    departFrame: 0,
    overlay: "none",
  },
  {
    id: "shadow",
    label: "Shadow",
    note: "B is dark for ten minutes — the rover arrives early and waits for the sun.",
    start: [48, 124],
    goal: [140, 44],
    zones: [],
    objective: "fastest",
    requireLight: true,
    departFrame: 0,
    overlay: "sun",
  },
  {
    id: "gate",
    label: "Gate",
    note: "Zones close the northern pass. Clear them and watch the route flip.",
    start: [12, 72],
    goal: [200, 72],
    zones: [
      { x: 500, y: 40, r: 62 },
      { x: 500, y: 140, r: 62 },
      { x: 500, y: 235, r: 56 },
      { x: 505, y: 325, r: 48 },
    ],
    objective: "fastest",
    requireLight: false,
    departFrame: 0,
    overlay: "none",
  },
];

export const FRAME_LABEL = (k: number, frameSeconds: number) => {
  const m = Math.round((k * frameSeconds) / 60);
  return `T+${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
