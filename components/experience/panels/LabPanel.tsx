"use client";

import PushbroomLab from "../../sections/lab/PushbroomLab";
import { useLarge } from "./useLarge";

/** The CSA pushbroom trade study: sized for the panel, side by side when opened large. */
export default function LabPanel() {
  return <PushbroomLab variant={useLarge() ? "wide" : "panel"} />;
}
