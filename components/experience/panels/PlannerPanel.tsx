"use client";

import PlannerVisual from "../../sections/projects/visuals/PlannerVisual";
import { useLarge } from "./useLarge";

/** The route planner, opened on the scenario that suits the stop: the fork (fastest or safest) or the gate (zones that close a pass). */
export const Fork = () => <PlannerVisual scenario="fork" narrow={!useLarge()} />;
export const Gate = () => <PlannerVisual scenario="gate" narrow={!useLarge()} />;
