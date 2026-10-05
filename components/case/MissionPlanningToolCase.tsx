import Reveal from "../ui/Reveal";
import { CaseSection, StatStrip, NumberedList, NextProject } from "./CaseParts";
import CaseHero from "./CaseHero";
import { getProject } from "@/data/projects";

const p = getProject("mission-planning-tool")!;

/** The general idea of grid-based path planning — the same three things the demo above lets you play with. */
const ideas = [
  {
    k: "Terrain becomes a grid",
    v: "Planning starts by turning the ground into cells and asking, for each one, how hard it is to cross: how steep it is, how close it sits to a hazard, how much light it gets.",
  },
  {
    k: "Costs decide the route",
    v: "A search then finds the cheapest chain of moves between two points. “Cheapest” is a choice: least time, safest ground, least energy. The same search with different costs gives a different route.",
  },
  {
    k: "Time changes the answer",
    v: "Light moves, so a route that works now can be in shadow ten minutes later. A planner can take that into account, and even choose to wait.",
  },
];

const tryThis = [
  ["Move the pins", "Drag A and B, or focus one and use the arrow keys."],
  ["Fastest or Safest", "Same terrain, two definitions of “best”: watch the route change."],
  ["Draw a keep-out zone", "Choose Keep-out zone, then click or drag on the map to close ground off. The route goes around it."],
  ["Sunlight only", "The rover plans around the light, and waits where it has to."],
  ["Search method", "Under Advanced: A* and Dijkstra return the same route. Turn on Explored to see how much less map A* reads."],
];

export default function MissionPlanningToolCase() {
  return (
    <>
      <CaseHero p={p} />
      <StatStrip
        stats={[
          { value: "3", label: "person team", to: 3 },
          { value: "Any", label: "laptop it runs on, even with low specs" },
          { value: "CSA", label: "internship project" },
        ]}
      />

      <CaseSection id="brief" n="01" label="The brief" title={<>A planning tool for <span className="serif">any laptop</span></>}>
        <div className="grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-7" selector="p" stagger={0.12}>
            <div className="space-y-6">
              <p className="lede !text-bone">
                As part of my internship at the Canadian Space Agency, I worked on rover mission planning: software that helps decide where a rover should go, and how it should get there.
              </p>
              <p className="body">
                We were a team of three. The other two worked on the existing, legacy software. I built a new tool alongside it, with two aims: that it should run on any laptop, low-spec ones included, and that it should try some unconventional ways of implementing path planning.
              </p>
              <p className="body">
                Because the work was done at the CSA, this page describes it in general terms. The interactive planner at the top is not that tool: it is a small illustration I wrote for this site, on made-up terrain, to show the kind of problem path planning solves.
              </p>
            </div>
          </Reveal>
          <Reveal className="lg:col-span-5" delay={0.1}>
            <dl className="divide-y divide-bone/10 border-y border-bone/10">
              {[
                ["Context", "Canadian Space Agency · internship"],
                ["Team", "3 people"],
                ["My part", "Front end · path-planning R&D"],
                ["Aim", "Runs on any laptop, even a low-spec one"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[6rem_1fr] gap-4 py-4">
                  <dt className="label pt-0.5">{k}</dt>
                  <dd className="text-[0.95rem] leading-snug">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </CaseSection>

      <CaseSection id="role" n="02" label="My role" title={<>The front end, <span className="serif">and a different way to plan</span></>}>
        <NumberedList
          items={[
            {
              title: "Own the front end",
              body: "Designed and built the interface of the new tool: what a planner sees and touches when setting up a plan and checking it.",
            },
            {
              title: "Look beyond the usual",
              body: "Explored unconventional ways of implementing path planning, rather than only the conventional ones.",
            },
            {
              title: "Keep it light",
              body: "Built the tool to run on any laptop, including low-spec machines.",
            },
            {
              title: "Work in a team of three",
              body: "Two teammates worked on the legacy software; I worked on a new tool.",
            },
          ]}
        />
      </CaseSection>

      <CaseSection id="planning" n="03" label="How planning works" title={<>From terrain to route, <span className="serif">in general terms</span></>}>
        <Reveal className="mb-10 max-w-3xl">
          <p className="lede">
            Most grid-based path planning comes down to three ideas. The planner at the top of this page uses all of them, on terrain that does not exist.
          </p>
        </Reveal>
        <Reveal selector="li" stagger={0.08}>
          <ul className="grid gap-px bg-bone/10 md:grid-cols-3">
            {ideas.map((it, i) => (
              <li key={it.k} className="bg-ink p-6 md:p-8">
                <p className="label tnum mb-4 text-laser">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="h-title mb-3 text-[1.2rem]">{it.k}</h3>
                <p className="body text-[0.95rem]">{it.v}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </CaseSection>

      <CaseSection id="demo" n="04" label="About the demo" title={<>A small <span className="serif">illustration</span></>}>
        <div className="grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-5" selector="p" stagger={0.1}>
            <div className="space-y-6">
              <p className="lede">
                It is not the CSA’s software. The terrain is made up, its parameters are illustrative, and it uses no CSA data or code.
              </p>
              <p className="body">
                It is simplified on purpose: the terrain is procedural, the patch is about a kilometre across, the sun moves far faster than the real one so that a short drive shows what takes hours, and there is no battery model.
              </p>
            </div>
          </Reveal>
          <Reveal className="lg:col-span-7" delay={0.1}>
            <p className="label label-strong mb-4">Things to try</p>
            <dl className="divide-y divide-bone/10 border-y border-bone/10">
              {tryThis.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[9.5rem_1fr] gap-4 py-4 md:grid-cols-[12rem_1fr]">
                  <dt className="label pt-0.5">{k}</dt>
                  <dd className="text-[0.95rem] leading-snug">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </CaseSection>

      <NextProject current={p.slug} />
    </>
  );
}
