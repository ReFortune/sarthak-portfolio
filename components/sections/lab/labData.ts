/**
 * Plain data for the pushbroom lab — kept free of any three.js import so UI code can use it
 * without dragging the 3D library into the initial bundle.
 */
export type Obstacle = { id: string; label: string; h: number; w: number; x: number; z: number };

/** Three 3 cm rocks at increasing lateral offset + one 10 cm reference block. */
export const OBSTACLES: Obstacle[] = [
  { id: "a", label: "3 cm", h: 0.03, w: 0.04, x: 0.45, z: 1.2 },
  { id: "b", label: "3 cm", h: 0.03, w: 0.04, x: 1.5, z: 2.05 },
  { id: "c", label: "3 cm", h: 0.03, w: 0.04, x: 2.45, z: 2.9 },
  { id: "d", label: "10 cm", h: 0.1, w: 0.1, x: -1.55, z: 3.55 },
];

export const LAB = { len: 4.7, halfWidth: 3.2, range: 20, fov: 270 };
