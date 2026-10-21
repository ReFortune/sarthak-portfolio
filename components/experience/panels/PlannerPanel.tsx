"use client";

import PlannerVisual from "../../sections/projects/visuals/PlannerVisual";

/** The route planner, opened on the scenario that suits the stop: the fork (fastest or safest) or the gate (zones that close a pass). */
export const Fork = () => <PlannerVisual scenario="fork" narrow />;
export const Gate = () => <PlannerVisual scenario="gate" narrow />;
