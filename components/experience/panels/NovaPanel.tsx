"use client";

import NovaVisual from "../../sections/projects/visuals/NovaVisual";
import { useLarge } from "./useLarge";

/** NOVA's ascent, power and figures, compact in the panel and as on the page when opened large. */
export default function NovaPanel() {
  return (
    <div className="absolute inset-0">
      <NovaVisual compact={!useLarge()} />
    </div>
  );
}
