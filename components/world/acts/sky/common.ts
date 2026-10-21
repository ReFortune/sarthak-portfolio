import * as THREE from "three";
import type { Layout } from "../../layout";
import type { ActContext, ActFrame, Label, Project, Sortable } from "../types";

/** How far from the station each cluster hangs, in metres. */
export const CLUSTER_DIST = 120;

/** A group of things in the sky that the camera stops to look at. Its local frame faces the station: +x is screen-right, +y up, +z toward the camera. */
export type Cluster = {
  group: THREE.Group;
  /** `a` 0–1 is how much the story is on it; `gain` is how visible it is. */
  update(f: ActFrame, a: number, gain: number): void;
  labels?(project: Project, a: number): Label[];
  sortables?(): Sortable[];
  dispose(): void;
};

export type ClusterContext = ActContext & { frame: { pos: THREE.Vector3; rotY: number } };

/** Where a cluster hangs for a station at azimuth `az`, `up` metres above it. */
export function clusterFrame(layout: Layout, az: number, up: number) {
  const c = layout.sky.center;
  const pos = new THREE.Vector3(c.x + Math.cos(az) * CLUSTER_DIST, c.y + up, c.z + Math.sin(az) * CLUSTER_DIST);
  return { pos, rotY: Math.atan2(-Math.cos(az), -Math.sin(az)) };
}
