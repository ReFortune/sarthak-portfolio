"use client";

import OscarVisual from "../../sections/projects/visuals/OscarVisual";
import { useLarge } from "./useLarge";

/** The ocean scene above the spectrum it is sampled into; side by side when opened large. */
export default function OscarPanel() {
  return <OscarVisual stacked={!useLarge()} />;
}
