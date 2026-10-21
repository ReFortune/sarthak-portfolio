import type * as THREE from "three";
import type { Sculpture } from "../../kit/sculpt";
import type { ActContext } from "../types";
import type { Slot } from "../../layout";

/** A point somewhere on an exhibit that the DOM would like to call out (local to the exhibit). */
export type Callout = { id: string; text: string; at: [number, number, number]; side?: "left" | "right" };

/** One of the six instruments in the ring. Its sculpture is placed and turned to face outward by the ring. */
export type Exhibit = {
  S: Sculpture;
  /** Where it can be picked (exhibit space) and how big it is. */
  pick: { center: [number, number, number]; radius: number };
  /** `active` 0–1: how much the story is on this exhibit. `hover` 0–1. `gain` is how visible the ring is. */
  tick(t: number, dt: number, active: number, hover: number, gain: number): void;
  callouts?: Callout[];
};

export type ExhibitContext = ActContext & { slot: Slot; pxPerUnit: THREE.IUniform<number> };
