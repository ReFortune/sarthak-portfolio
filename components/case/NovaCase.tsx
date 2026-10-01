import Reveal from "../ui/Reveal";
import { CaseSection, StatStrip, NumberedList, Documents, NextProject } from "./CaseParts";
import CaseHero from "./CaseHero";
import FigureGallery, { type Fig } from "./FigureGallery";
import { PsdChart, PowerBudget } from "./Charts";
import { getProject } from "@/data/projects";

const p = getProject("nova-payload")!;
const A = "/assets/projects/nova";

const subsystems = [
  { k: "Scientific", v: "ZWO ASI120MM Mini CMOS camera with a Raspberry Pi 6 mm wide-field lens — tuned for high signal-to-noise at low cost rather than high resolution." },
  { k: "Computational", v: "BeagleBone Black Industrial with a 256 GB microSD. Built to keep running after any power loss without losing image data." },
  { k: "Environmental", v: "−30 °C to +50 °C, near-vacuum pressure and radiation. Passive thermal control (heat sinks and a conformal resin coating); software error correction for the short mission." },
  { k: "Mechanical", v: "Aluminum 6061 structure with a 45° camera mount, engineered to hold alignment through launch, ascent and descent within the 40 km altitude range." },
  { k: "Electrical", v: "A 5 V DC supply drawn from the main payload, with a hard ceiling of 4 W." },
  { k: "Software", v: "Custom acquisition, processing and error-correction software protecting scientific validity and data integrity." },
];

const verification = [
  { id: "2.2", req: "Withstand −30 °C to +50 °C", method: "Rated components; design review of insulation", status: "Design review" },
  { id: "2.6", req: "Function under UV / low pressure typical of the stratosphere", method: "Resin coating; Mylar reflectivity data", status: "Design review" },
  { id: "2.7", req: "Anti-condensation measures", method: "Resin sealing and an enclosed design", status: "Design review" },
  { id: "3.2", req: "Maintain 45° camera alignment", method: "FEM-based alignment checks under load and vibration", status: "FEM" },
  { id: "3.3", req: "Withstand vibrational loads (random vibration)", method: "FEM simulation @ 10 G with a high-PSD margin", status: "FEM" },
  { id: "3.4", req: "Structural stability at minimum weight (Al 6061)", method: "Mass measurement + FEA stress below yield", status: "FEM" },
];

const deviations = [
  { t: "16-bit at 640 × 480, not 1280 × 960", b: "The camera would not run reliably in 16-bit at full resolution. Dropping resolution kept the brightness measurement scientifically valid — the mission needs to compare star brightness, not admire detail." },
  { t: "5 s exposures, restored", b: "Exposure fell back to the manufacturer-supported 0.9 s, then returned to 5 s once resolution was lowered and the processing load eased." },
  { t: "Resin instead of Mylar", b: "After talking with the RSOnar III team the thermal strategy switched to a conformal resin coating: more durable, lower outgassing, no mass penalty." },
  { t: "Hardware arrived late", b: "The OBC and camera units were delayed, so flight software was developed on laptops and hardware testing slid a month, compensated with focused, mission-critical tests." },
  { t: "A darker sky than we could reach", b: "Field imaging was planned under Bortle 2–3 skies but done at a Bortle 6 site; exposures were lengthened to compensate and validate the pipeline." },
];

const figures: Fig[] = [
  { src: `${A}/cad-iso.webp`, alt: "CAD isometric view of the NOVA payload on its triangular bracket", caption: "CAD · payload on the triangular 45° bracket", w: 1400, h: 751 },
  { src: `${A}/cad-side.webp`, alt: "CAD side elevation: camera, BeagleBone Black and aluminium bracket", caption: "CAD · side elevation: camera, BeagleBone Black, bracket", w: 871, h: 850 },
  { src: `${A}/fem-displacement.webp`, alt: "Finite-element displacement contour of the camera mount", caption: "FEM · displacement contour under the 10 G load case", w: 952, h: 636 },
  { src: `${A}/fem-10g.webp`, alt: "Second displacement view of the camera mount under 10 G", caption: "FEM · displacement, second view (scale in mm)", w: 1100, h: 656 },
  { src: `${A}/fem-stress.webp`, alt: "Von Mises stress contour of the camera mount", caption: "FEM · von Mises stress", w: 867, h: 645 },
  { src: `${A}/machined-mount.webp`, alt: "The machined aluminium camera mount held in a hand", caption: "Hardware · the machined Aluminum 6061 camera mount", w: 538, h: 247 },
  { src: `${A}/power-architecture.webp`, alt: "Power and data architecture block diagram", caption: "Power & data architecture: gondola supply → DC/DC → PDU → payload rails", w: 1128, h: 1000 },
];

export default function NovaCase() {
  return (
    <>
      <CaseHero p={p} />
      <StatStrip
        stats={[
          { value: "<500 g", label: "mass allocation" },
          { value: "40 km", label: "flight altitude" },
          { value: "3.7 W", label: "held peak · 4 W budget" },
          { value: "6", label: "subsystems traced to named tests", to: 6 },
        ]}
      />

      <CaseSection n="01" label="The brief" title={<>Seeing through the <span className="serif">noise</span></>}>
        <div className="grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-7" selector="p" stagger={0.12}>
            <div className="space-y-6">
              <p className="lede !text-bone">
                There are over 200,000 resident space objects larger than 2&nbsp;cm in low-Earth orbit, and the number keeps
                rising. Tracking them reliably is a critical research problem.
              </p>
              <p className="body">
                NOVA is a secondary payload on the Canadian Space Agency’s RSOnar III stratospheric balloon. On the earlier
                RSOnar II mission, excessive background noise limited how well those objects could be detected. NOVA answers
                with a second camera in the <em>same</em> field of view as the main payload, so cosmic-ray hits and other noise
                can be told apart from real objects, and the sky background can be subtracted precisely.
              </p>
              <p className="body">
                The two objectives: sharpen the calibration of the RSOnar III payload through precise background
                characterisation, and cut false positives from noise sources such as cosmic rays — while measuring
                night-sky brightness at 40&nbsp;km altitude.
              </p>
            </div>
          </Reveal>
          <Reveal className="lg:col-span-5" delay={0.1}>
            <dl className="divide-y divide-bone/10 border-y border-bone/10">
              {[
                ["Programme", "ENG 4000 capstone · Team 24"],
                ["Partner", "Canadian Space Agency · RSOnar III"],
                ["Supervisors", "Prof. Michael Bazzocchi · Dr. Ryan Clark"],
                ["Team", "6 students"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7rem_1fr] gap-4 py-4">
                  <dt className="label pt-0.5">{k}</dt>
                  <dd className="text-[0.95rem] leading-snug">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </CaseSection>

      <CaseSection n="02" label="My role" title={<>Project &amp; <span className="serif">systems lead</span></>}>
        <NumberedList
          items={[
            { title: "Lead the team", body: p.bullets[0] },
            { title: "Own the interface", body: p.bullets[1] },
            { title: "Qualify the structure", body: p.bullets[2] },
            { title: "Hold the power budget", body: p.bullets[3] },
          ]}
        />
      </CaseSection>

      <CaseSection n="03" label="Architecture" title={<>Six subsystems, <span className="serif">one traceable payload</span></>}>
        <Reveal selector="[data-sub]" stagger={0.08}>
          <div className="grid gap-px bg-bone/10 sm:grid-cols-2 lg:grid-cols-3">
            {subsystems.map((s, i) => (
              <div key={s.k} data-sub className="bg-ink p-7 md:p-8">
                <p className="label mb-6 flex items-center justify-between">
                  <span className="label-strong">{s.k}</span>
                  <span className="tnum text-laser">{String(i + 1).padStart(2, "0")}</span>
                </p>
                <p className="body text-[0.95rem]">{s.v}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </CaseSection>

      <CaseSection n="04" label="Qualification" title={<>Random vibration, <span className="serif">analysed</span></>}>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <Reveal>
              <PsdChart />
            </Reveal>
            <Reveal className="mt-8 grid grid-cols-3 gap-px bg-bone/10" delay={0.1}>
              {[
                ["10 G", "load case"],
                ["< 0.1 mm", "displacement"],
                ["≤ 8 %", "aluminium strain limit"],
              ].map(([v, l]) => (
                <div key={l} className="bg-ink p-4 md:p-6">
                  <p className="h-display text-[clamp(1.4rem,2.6vw,2.6rem)] leading-none normal-case">{v}</p>
                  <p className="label mt-3">{l}</p>
                </div>
              ))}
            </Reveal>
          </div>
          <div className="lg:col-span-5">
            <Reveal>
              <p className="body">
                Balloon flights are dominated by random, non-deterministic loads — turbulence, wind gusts — so random-vibration
                analysis is the right tool. The profile used is deliberately harsh (launch-level), to leave a large margin on the
                Aluminum 6061 structure and the 45° camera mount.
              </p>
            </Reveal>
            <Reveal className="mt-8" selector="li" stagger={0.06}>
              <ul className="divide-y divide-bone/10 border-y border-bone/10">
                {verification.map((v) => (
                  <li key={v.id} className="py-4">
                    <p className="flex items-baseline justify-between gap-4">
                      <span className="text-[0.92rem] leading-snug">
                        <span className="label mr-2.5 tnum text-laser">{v.id}</span>
                        {v.req}
                      </span>
                      <span className={`chip shrink-0 ${v.status === "FEM" ? "!border-ice/50 !text-ice" : ""}`}>{v.status}</span>
                    </p>
                    <p className="label mt-1.5 !normal-case !tracking-normal">{v.method}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </CaseSection>

      <CaseSection n="05" label="Power" title={<>Staying under <span className="serif">four watts</span></>}>
        <div className="max-w-4xl pt-6">
          <Reveal>
            <PowerBudget />
          </Reveal>
        </div>
      </CaseSection>

      <CaseSection n="06" label="Figures" title={<>From the <span className="serif">report</span></>}>
        <FigureGallery items={figures} />
      </CaseSection>

      <CaseSection n="07" label="Retrospective" title={<>What didn’t go <span className="serif">to plan</span></>}>
        <Reveal selector="[data-dev]" stagger={0.09}>
          <div className="grid gap-px bg-bone/10 md:grid-cols-2 lg:grid-cols-3">
            {deviations.map((d, i) => (
              <div key={d.t} data-dev className="bg-ink p-7 md:p-8">
                <p className="label mb-5 tnum text-laser">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="h-title mb-3 text-[1.2rem]">{d.t}</h3>
                <p className="body text-[0.94rem]">{d.b}</p>
              </div>
            ))}
            <div data-dev className="bg-ink-2 p-7 md:p-8">
              <p className="label mb-5 !text-laser">Lessons</p>
              <ul className="space-y-3 text-[0.94rem] leading-snug text-bone">
                <li>Get flight hardware early — it gates flight software and therefore testing.</li>
                <li>Proven hardware beats novel hardware, especially on the third mission in a series.</li>
                <li>Plan for the tests you can’t run: as of the March 2025 report, cold-chamber and vacuum tests weren’t possible within cost and schedule, so environmental verification rested on rated components, design review and FEM.</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </CaseSection>

      <CaseSection n="08" label="Documents" title={<>Read the <span className="serif">source</span></>}>
        <Documents
          docs={[
            {
              href: "/assets/projects/nova/payload-summary.pdf",
              label: "NOVA — final progress report",
              detail: "ENG 4000 · Winter 2025 · 101 pages: requirements, as-built design, test status, risks and lessons",
              size: "15.6 MB",
            },
          ]}
        />
      </CaseSection>

      <NextProject current={p.slug} />
    </>
  );
}
