"use client";

import TeamGrowth from "../../sections/leadership/TeamGrowth";
import TrussBridge from "../../sections/leadership/TrussBridge";

/** The Steel Bridge team: how it grew, and the member experiment. */
export default function CrewPanel() {
  return (
    <div className="space-y-6 p-4">
      <div>
        <p className="label label-strong mb-3">Team · seats filled</p>
        <TeamGrowth />
      </div>
      <TrussBridge />
    </div>
  );
}
