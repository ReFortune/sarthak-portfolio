import Reveal from "../ui/Reveal";
import { CaseSection, StatStrip, NumberedList, Documents, NextProject } from "./CaseParts";
import CaseHero from "./CaseHero";
import FigureGallery, { type Fig } from "./FigureGallery";
import VideoCard from "../sections/VideoCard";
import { getProject } from "@/data/projects";

const p = getProject("hospital-dispensing-robot")!;
const A = "/assets/projects/dispensing-robot";

const concepts = [
  { k: "Carousel", v: "Compact circular storage for many pill boxes.", why: "Concentrates load on a single rotational axis — structural stress that would need a heavier support than the size and weight limits allow.", ok: false },
  { k: "Linear pusher", v: "Simple actuation: push the next box out.", why: "Needs boxes stacked vertically, raising the centre of mass and the risk of tipping when turning into room branches.", ok: false },
  { k: "Gravity-fed", v: "Minimal actuation, very simple.", why: "No precise control over individual release, and prone to dispensing more than one item by accident.", ok: false },
  { k: "Lug conveyor", v: "A servo-driven track moving boxes in discrete steps to a release point.", why: "Controlled, sequential, single-item release with a lower centre of mass and uniform load. The price: more mechanical complexity and sensitivity to alignment.", ok: true },
];

const specs = [
  ["Drive", "Differential drive, two DC motors"],
  ["Dispenser", "Servo-driven lug conveyor, independent of the drivetrain"],
  ["Sprocket", "10 teeth · diametral pitch 7 → ≈ 1.43 in pitch diameter"],
  ["Link pitch", "0.449 in circular pitch, matched to the sprocket"],
  ["Links", "3D-printed, geometry designed from scratch"],
  ["Stability", "Low, central centre of mass between castor and drive wheels"],
];

const bom = [
  { k: "Servo motors ×2", v: 35.41 },
  { k: "2S LiPo battery 3000 mAh", v: 24.11 },
  { k: "ESP32 (Waveshare)", v: 21.46 },
  { k: "PLA filament", v: 20.33 },
  { k: "DC motors ×2", v: 17.39 },
  { k: "RGB colour sensor (TCS34725)", v: 16.94 },
];

const next = [
  { t: "Stable power", b: "Dedicated regulators, proper grounding and decoupling to stop voltage fluctuation reaching the sensors and actuators." },
  { t: "Wiring that survives", b: "Secure connections, deliberate routing and strain relief, so signals stay clean between sensors, controller and actuators." },
  { t: "Tighter tolerances", b: "Conveyor links printed on an FDM printer varied in pitch and alignment, which showed up as inconsistent indexing. Better processes or parts would fix it at the source." },
  { t: "Lighting-robust sensing", b: "Colour detection drifted with ambient light; shielding, calibration and signal conditioning would keep the decision logic honest." },
];

const figures: Fig[] = [
  { src: `${A}/prototype.webp`, alt: "The CHIRON prototype on a workbench: a robot with a lug-conveyor dispenser", caption: "The prototype · lug-conveyor dispenser on a compact chassis", w: 1600, h: 1200, paper: false },
  { src: `${A}/prototype-annotated.webp`, alt: "Annotated photo naming the ESP32, lug conveyor, track sprocket, drive wheel, track adjustor, track links and chassis", caption: "Redlined: ESP32 · lug conveyor · sprocket · drive wheel · chassis", w: 1362, h: 1000, paper: false },
  { src: `${A}/cad-overview.webp`, alt: "CAD overview of the chassis and conveyor", caption: "CAD · chassis, drivetrain and conveyor overview", w: 855, h: 746 },
  { src: `${A}/cad-chassis.webp`, alt: "CAD side view of the chassis showing sprockets and gears", caption: "CAD · gears, sprocket and chassis profile", w: 1079, h: 668 },
  { src: `${A}/conveyor-links.webp`, alt: "Engineering drawing of a conveyor track link", caption: "Engineering drawing · conveyor track link", w: 966, h: 665 },
  { src: `${A}/flowchart.webp`, alt: "Operational flow chart of the autonomous pill-dispensing robot", caption: "Operational flow chart · corridor logic", w: 705, h: 608 },
  { src: `${A}/perfboard-top.webp`, alt: "Hand-soldered perfboard with MOSFET drivers, top view", caption: "Circuit · motor-driver perfboard (top)", w: 719, h: 503, paper: false },
  { src: `${A}/wiring.webp`, alt: "Sensors and wiring assembled on the test bench", caption: "Bench integration · sensors and wiring", w: 1889, h: 860, paper: false },
];

export default function ChironCase() {
  const maxBom = Math.max(...bom.map((b) => b.v));
  return (
    <>
      <CaseHero p={p} />
      <StatStrip
        stats={[
          { value: "$300", label: "project budget cap" },
          { value: "≈ $200", label: "final bill of materials (CAD)" },
          { value: "3", label: "person team", to: 3 },
          { value: "4", label: "dispensing concepts weighed", to: 4 },
        ]}
      />

      <CaseSection n="01" label="The brief" title={<>One pill box, <span className="serif">right room</span></>}>
        <div className="grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-7" selector="p" stagger={0.12}>
            <div className="space-y-6">
              <p className="lede !text-bone">
                CHIRON — the Compact Hospital Intelligent Robotic Operation Navigator — is a small autonomous robot for a
                simulated hospital ward: it follows a corridor, detects room branches, reads which medication is indicated and
                releases one pill box at the delivery zone, with no human in the loop.
              </p>
              <p className="body">
                The system is three tightly integrated subsystems: electromechanical (drivetrain, chassis and the dispensing
                mechanism), circuits (sensor interfacing and protected power distribution) and a microcontroller that runs the
                navigation logic and real-time control. I led the first, and the integration between them.
              </p>
              <p className="body">
                The constraint that shaped everything was money: a CAD&nbsp;$300 budget for a robot that has to drive, sense and
                dispense.
              </p>
            </div>
          </Reveal>
          <Reveal className="lg:col-span-5" delay={0.1}>
            <dl className="divide-y divide-bone/10 border-y border-bone/10">
              {[
                ["Course", "ESSE 3380 · Introduction to Mechatronics"],
                ["Team", "3 students: electro-mechanical, circuits, microcontroller"],
                ["My subsystem", "Electro-mechanical — chassis, drivetrain, dispenser"],
                ["Controller", "ESP32"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-4 py-4">
                  <dt className="label pt-0.5">{k}</dt>
                  <dd className="text-[0.95rem] leading-snug">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
        <Reveal className="mt-14" y={50}>
          <VideoCard
            src={`${A}/demo.mp4`}
            poster={`${A}/demo-poster.webp`}
            title="Demo · line-following at a branch"
            caption="Fig. — Test run on the tape-line corridor"
            duration="0:12"
          />
        </Reveal>
      </CaseSection>

      <CaseSection n="02" label="My role" title={<>Mechanical &amp; <span className="serif">electro-mechanical lead</span></>}>
        <NumberedList
          items={[
            { title: "Lead the mechanics", body: p.bullets[0] },
            { title: "Choose the mechanism", body: "Evaluated carousel, linear-pusher and gravity-fed concepts against the lug conveyor and selected the final design on load path, stability and control." },
            { title: "Design from scratch", body: "CAD for a compact, structurally sound chassis; the conveyor links and the sprocket / spindle interface designed from first principles, backed by torque, load-distribution and stability calculations." },
            { title: "Build and integrate", body: "Led fabrication and mechanical assembly; integrated the DC drive motors and the servo-driven conveyor; found and resolved alignment and tolerance problems and redesigned the chassis during integration." },
            { title: "Stay on budget", body: p.bullets[1] },
          ]}
        />
      </CaseSection>

      <CaseSection n="03" label="Concept trade" title={<>Four ways to release <span className="serif">one box</span></>}>
        <Reveal selector="[data-concept]" stagger={0.1}>
          <div className="grid gap-px bg-bone/10 md:grid-cols-2 lg:grid-cols-4">
            {concepts.map((c) => (
              <div key={c.k} data-concept className={`relative flex flex-col p-7 md:p-8 ${c.ok ? "bg-ink-3" : "bg-ink"}`}>
                <p className="label mb-6 flex items-center justify-between">
                  <span className={c.ok ? "label-strong" : ""}>{c.ok ? "Selected" : "Rejected"}</span>
                  <span aria-hidden="true" className={c.ok ? "text-laser" : "text-bone-mute"}>{c.ok ? "●" : "✕"}</span>
                </p>
                <h3 className="h-display mb-3 text-[clamp(1.4rem,2vw,1.9rem)] !leading-[1]">{c.k}</h3>
                <p className="serif mb-5 text-[1.05rem] leading-tight text-bone-dim">{c.v}</p>
                <p className="body mt-auto text-[0.92rem]">{c.why}</p>
                {c.ok && <span className="absolute inset-x-0 top-0 h-px bg-laser" />}
              </div>
            ))}
          </div>
        </Reveal>
      </CaseSection>

      <CaseSection n="04" label="The mechanism" title={<>Matching pitch to <span className="serif">pill box</span></>}>
        <div className="grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-7" selector="[data-spec]" stagger={0.06}>
            <dl className="grid gap-px bg-bone/10 sm:grid-cols-2">
              {specs.map(([k, v]) => (
                <div key={k} data-spec className="bg-ink p-6">
                  <dt className="label mb-3">{k}</dt>
                  <dd className="text-[0.95rem] leading-snug">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal className="lg:col-span-5" delay={0.1}>
            <p className="body">
              A 10-tooth sprocket at diametral pitch 7 sets the conveyor’s linear spacing: its circular pitch of 0.449&nbsp;in
              became the link pitch, so each step advances exactly one lug. Choosing a larger pitch also made the mechanism more
              forgiving of the dimensional variation of 3D-printed links.
            </p>
            <p className="body mt-5">
              Mobility and dispensing are deliberately independent: the track is part of the dispenser only, which keeps the
              drivetrain simple and lets each be debugged on its own.
            </p>
          </Reveal>
        </div>
      </CaseSection>

      <CaseSection n="05" label="Budget" title={<>Inside the <span className="serif">$300 cap</span></>}>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-7">
            <p className="label mb-5 flex items-center justify-between">
              <span>Largest line items (CAD)</span>
              <span className="label-strong tnum">Total BOM ≈ $200</span>
            </p>
            <ul className="space-y-4">
              {bom.map((b) => (
                <li key={b.k}>
                  <p className="mb-1.5 flex justify-between gap-4 text-[0.92rem]">
                    <span>{b.k}</span>
                    <span className="mono tnum">${b.v.toFixed(2)}</span>
                  </p>
                  <span className="relative block h-1.5 bg-bone/10">
                    <span className="absolute inset-y-0 left-0 bg-laser" style={{ width: `${(b.v / maxBom) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="label mt-6 !normal-case !tracking-normal">Plus eleven smaller line items: IR and ultrasonic sensors, MOSFETs, a buck converter, connectors, diodes, a capacitor, an e-stop and a castor wheel.</p>
          </Reveal>
          <Reveal className="lg:col-span-5" delay={0.1}>
            <div className="border border-bone/15 p-7">
              <p className="label mb-5">Budget used</p>
              <p className="h-display text-[clamp(3rem,6vw,5.4rem)] leading-none tnum">67<span className="serif text-[0.5em] normal-case text-bone-dim">%</span></p>
              <span className="relative mt-6 block h-2 bg-bone/10"><span className="absolute inset-y-0 left-0 w-[67%] bg-laser" /></span>
              <p className="label mt-4 !normal-case !tracking-normal">About $200 of the $300 cap, per the project’s final report.</p>
            </div>
          </Reveal>
        </div>
      </CaseSection>

      <CaseSection n="06" label="Results" title={<>What worked, <span className="serif">and what comes next</span></>}>
        <div className="grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-5" selector="p" stagger={0.12}>
            <div className="space-y-6">
              <p className="lede !text-bone">Navigation was the strong point. Dispensing was not yet reliable.</p>
              <p className="body">
                Under controlled conditions CHIRON followed the corridor, detected room branches and positioned itself in delivery
                zones with reasonable consistency. Single-item dispensing was less dependable: misalignment between the conveyor
                and the release point, servo positioning variability and inconsistent indexing caused occasional failed
                deliveries, and colour detection was sensitive to lighting.
              </p>
              <p className="body">
                The report’s own diagnosis: circuit reliability and mechanical precision — not the concept — were the limiting
                factors. Its recommendations, roughly in order of impact:
              </p>
            </div>
          </Reveal>
          <Reveal className="lg:col-span-7" selector="[data-next]" stagger={0.09}>
            <div className="grid gap-px bg-bone/10 sm:grid-cols-2">
              {next.map((n, i) => (
                <div key={n.t} data-next className="bg-ink p-7">
                  <p className="label mb-4 tnum text-laser">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="h-title mb-2.5 text-[1.15rem]">{n.t}</h3>
                  <p className="body text-[0.92rem]">{n.b}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </CaseSection>

      <CaseSection n="07" label="Figures" title={<>On the <span className="serif">bench</span></>}>
        <FigureGallery items={figures} />
      </CaseSection>

      <CaseSection n="08" label="Documents" title={<>Read the <span className="serif">source</span></>}>
        <Documents
          docs={[
            {
              href: "/assets/projects/dispensing-robot/report.pdf",
              label: "CHIRON — final report",
              detail: "ESSE 3380 · April 2026 · 47 pages: problem formulation, subsystem design, integration, testing and budget",
              size: "15.9 MB",
            },
          ]}
        />
      </CaseSection>

      <NextProject current={p.slug} />
    </>
  );
}
