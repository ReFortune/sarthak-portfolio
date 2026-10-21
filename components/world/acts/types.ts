import type * as THREE from "three";
import type { CamState } from "../rig";
import type { Layout } from "../layout";

/** What an act sees each frame. */
export type ActFrame = {
  t: number;
  dt: number;
  /** Displayed scroll progress (smoothed). */
  u: number;
  /** Beat index and how far through it (0–1); `x` is `beat + local`, a continuous coordinate along the story. */
  beat: number;
  local: number;
  x: number;
  cam: CamState;
  camera: THREE.PerspectiveCamera;
  pointer: { x: number; y: number; active: boolean };
  /** 0 → 1 as the world is first uncovered. */
  intro: number;
  /** Kick the screen transition (a gate pulse), 0–1. */
  pulse(strength: number): void;
  /** A ranging ripple spreading out over the ground from a point. */
  ping(x: number, z: number): void;
};

/** Something the DOM draws at a point of the world. */
export type Label = {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  text?: string;
  /** Which side of the point the text sits. */
  side?: "left" | "right" | "top" | "bottom";
  alpha?: number;
  /** A heading for a group (`cluster`), a year over its gate (`year`, with `lines` beneath), or a tag on one thing. */
  kind?: "tag" | "cluster" | "year";
  lines?: string[];
  /** Dropped on narrow screens. */
  minor?: boolean;
};
export type Project = (v: THREE.Vector3) => { x: number; y: number; visible: boolean };

export type ActContext = {
  layout: Layout;
  camera: THREE.PerspectiveCamera;
  pxPerUnit: THREE.IUniform<number>;
  lowPower: boolean;
  reduced: boolean;
};

/** A solid thing that hides what is behind it, so the world draws these far to near. */
export type Sortable = { pos: THREE.Vector3; setOrder(base: number): void };

/** A set piece in the world: it owns a group, shows itself when the story is near it and animates with it. */
export type Act = {
  group: THREE.Group;
  update(f: ActFrame): void;
  dispose(): void;
  /** Screen positions (pixels) of anything the DOM wants to label this frame. */
  labels?(project: Project): Label[];
  /** Pointer: which exhibit is under it (the ring). */
  hover?(ndcX: number, ndcY: number): string | null;
  /** The solid things in it, for drawing order. */
  sortables?(): Sortable[];
};

export type ActFactory = (ctx: ActContext) => Act;
