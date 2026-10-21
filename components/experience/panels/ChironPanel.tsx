"use client";

import ChironVisual from "../../sections/projects/visuals/ChironVisual";
import { useLarge } from "./useLarge";

/** CHIRON's corridor logic first (it is the part that moves), the prototype and its budget below; side by side when opened large. */
export default function ChironPanel() {
  return <ChironVisual stacked={!useLarge()} />;
}
