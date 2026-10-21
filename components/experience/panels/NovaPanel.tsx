"use client";

import NovaVisual from "../../sections/projects/visuals/NovaVisual";

/** NOVA's ascent, power and figures, for a narrow box. */
export default function NovaPanel() {
  return (
    <div className="absolute inset-0">
      <NovaVisual compact />
    </div>
  );
}
