import Reveal from "../ui/Reveal";
import { CaseSection, StatStrip, NumberedList, Documents, NextProject } from "./CaseParts";
import CaseHero from "./CaseHero";
import FigureGallery, { type Fig } from "./FigureGallery";
import { CostDonut } from "./Charts";
import { getProject } from "@/data/projects";

const p = getProject("route-m")!;
const A = "/assets/projects/route-m";

const conops = [
  { t: "Launch & parking orbit", d: "Launch into a ~300 km circular Earth parking orbit; systems check-out and timing of the trans-Mars injection burn." },
  { t: "Interplanetary transfer", d: "A Hohmann transfer of roughly 259 days, with periodic trajectory-correction manoeuvres." },
  { t: "Mars orbit insertion", d: "A capture burn transitions the spacecraft from heliocentric to a Mars orbit." },
  { t: "Orbital deployment", d: "One orbiter into a near-polar (~93°) orbit for global coverage; the other at ~45° for complementary passes." },
  { t: "Science mapping", d: "Daylight-pass imaging at ~1 m/pixel, pointing up to 15° off-nadir to widen coverage." },
  { t: "Data downlink", d: "Imagery is processed and compressed on board, then sent to Earth through NASA’s Deep Space Network." },
];

const payload = [
  ["Architecture", "Pushbroom imager, HiRISE-derived, with time-delay integration"],
  ["Resolution", "≈ 1 m / pixel from a 300 km orbit"],
  ["Detector", "≈ 40,000 × 20,000 px equivalent (along × across track)"],
  ["Spectral range", "≈ 400–900 nm, multi-band"],
  ["Pointing", "Off-nadir up to ±15° to raise coverage efficiency"],
  ["Pointing jitter", "≤ 5 µrad, about 1.55 m of smear at a 310 km slant range"],
  ["On-board data", "14-bit capture → 8-bit → JPEG2000, ≈ 10× smaller"],
  ["Geometry", "GSD = H · p ÷ f — altitude, pixel pitch, focal length"],
];

const link = [
  { k: "Payload imagery", v: 3.125, c: "bg-laser" },
  { k: "Command overhead & coding", v: 0.156, c: "bg-ice" },
  { k: "Health telemetry", v: 0.051, c: "bg-bone/70" },
  { k: "ADCS tracking", v: 0.026, c: "bg-bone/40" },
];
const LIMIT = 3.5;

const figures: Fig[] = [
  { src: `${A}/stk-groundtrack.webp`, alt: "STK ground-track map of the two orbiters over a Mars surface texture", caption: "STK · ground tracks across the Martian surface", w: 1280, h: 720, paper: false },
  { src: `${A}/stk-orbit.webp`, alt: "STK 3D view of the orbit swath around Mars", caption: "STK · orbit and swath around Mars", w: 820, h: 582, paper: false },
  { src: `${A}/stk-coverage.webp`, alt: "STK rectangular map showing the coverage bands", caption: "STK · coverage bands (map view)", w: 820, h: 582, paper: false },
  { src: `${A}/hohmann.webp`, alt: "3D plot of the Earth–Mars Hohmann transfer", caption: "Earth → Mars Hohmann transfer and separation event", w: 1100, h: 996 },
  { src: `${A}/cdh-pipeline.webp`, alt: "Command and data handling pipeline: pushbroom camera to bit-depth reduction, JPEG2000 compression and downlink", caption: "C&DH pipeline: 14-bit raw → 8-bit → JPEG2000 → storage → downlink", w: 1400, h: 933, paper: false },
  { src: `${A}/downlink.webp`, alt: "Earth–Mars distance and Ka-band downlink rate estimate over the mission", caption: "Earth–Mars distance and Ka-band downlink estimate", w: 1276, h: 746 },
  { src: `${A}/image-schedule.webp`, alt: "Image-acquisition schedule based on downlink capacity", caption: "Image-acquisition schedule, set by downlink capacity", w: 1189, h: 590 },
];

export default function RouteCase() {
  return (
    <>
      <CaseHero p={p} />
      <StatStrip
        stats={[
          { value: "≤ 1 m", label: "ground sample distance" },
          { value: "300 km", label: "sun-synchronous orbit" },
          { value: "2", label: "satellite stereo constellation", to: 2 },
          { value: "7 yr", label: "design life" },
        ]}
      />

      <CaseSection n="01" label="The brief" title={<>Global Mars, <span className="serif">at one metre</span></>}>
        <div className="grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-7" selector="p" stagger={0.12}>
            <div className="space-y-6">
              <p className="lede !text-bone">
                Mars orbiters can either image small targeted areas in fine detail (HiRISE) or cover the whole planet at lower
                resolution (CTX). No mission is optimised for sustained global coverage at about one metre per pixel.
              </p>
              <p className="body">
                ROUTE-M closes that gap: a Mars mapping mission producing a high-resolution global map to support autonomous
                rover navigation, landing-site certification and orbital operations. Two satellites in low orbit image the
                surface in stereo, and the design was developed through the NASA project lifecycle to Critical Design Review.
              </p>
              <p className="body">
                Why it matters: future missions lean on autonomy — path planning, hazard avoidance, descent and landing risk
                assessment — and all of it needs globally consistent, high-definition terrain models.
              </p>
            </div>
          </Reveal>
          <Reveal className="lg:col-span-5" delay={0.1}>
            <dl className="divide-y divide-bone/10 border-y border-bone/10">
              {[
                ["Course", "ESSE 4361 · Space Mission Design"],
                ["Stakeholders", "Space agencies · planetary-science community · future robotic & human exploration"],
                ["Mission duration", "9 years incl. cruise, orbit insertion and mapping"],
                ["Design life", "7-year mapping mission"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-4 py-4">
                  <dt className="label pt-0.5">{k}</dt>
                  <dd className="text-[0.95rem] leading-snug">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </CaseSection>

      <CaseSection n="02" label="My role" title={<>Systems &amp; <span className="serif">payload lead</span></>}>
        <NumberedList
          items={[
            { title: "Lead the lifecycle", body: p.bullets[0] },
            { title: "Architecture & payload", body: p.bullets[1] },
            { title: "Close the big trade", body: p.bullets[2] },
            { title: "Budgets & risk", body: p.bullets[3] },
          ]}
        />
      </CaseSection>

      <CaseSection n="03" label="Mission concept" title={<>From Earth orbit to <span className="serif">global map</span></>}>
        <Reveal selector="li" stagger={0.09}>
          <ol className="grid gap-px bg-bone/10 sm:grid-cols-2 lg:grid-cols-3">
            {conops.map((c, i) => (
              <li key={c.t} className="relative bg-ink p-7 md:p-8">
                <span className="h-display mb-7 block text-[2.6rem] leading-none text-laser tnum">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="h-title mb-3 text-[1.2rem]">{c.t}</h3>
                <p className="body text-[0.94rem]">{c.d}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </CaseSection>

      <CaseSection n="04" label="The payload" title={<>One metre, <span className="serif">from 300 km</span></>}>
        <div className="grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-7" selector="div[data-row]" stagger={0.06}>
            <dl className="grid gap-px bg-bone/10 sm:grid-cols-2">
              {payload.map(([k, v]) => (
                <div key={k} data-row className="bg-ink p-6">
                  <dt className="label mb-3">{k}</dt>
                  <dd className="text-[0.95rem] leading-snug">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal className="lg:col-span-5" delay={0.1}>
            <p className="body">
              Pointing stability is what turns optics into pixels. At a 310&nbsp;km slant range, a 5&nbsp;µrad jitter smears the
              image by R·θ ≈ 1.55&nbsp;m — the same order as the target resolution — so ≤&nbsp;5&nbsp;µrad is the requirement that
              keeps a 1&nbsp;m/pixel product honest, and is still within reach of a realistic attitude-control system.
            </p>
            <p className="body mt-5">
              Data volume does the rest of the shaping: the raw stream is reduced on board before it ever touches the downlink.
            </p>
          </Reveal>
        </div>
      </CaseSection>

      <CaseSection n="05" label="Budgets" title={<>Where the <span className="serif">$750M</span> goes</>}>
        <Reveal>
          <CostDonut />
        </Reveal>
        <Reveal className="mt-20" delay={0.05}>
          <p className="label mb-5 flex flex-wrap items-center justify-between gap-x-6">
            <span className="label-strong">Daily downlink budget</span>
            <span className="tnum">3.36 GB of {LIMIT} GB per sol · 4% margin</span>
          </p>
          <div className="flex h-10 w-full overflow-hidden bg-bone/[0.07]">
            {link.map((l) => (
              <span key={l.k} className={`${l.c} block h-full`} style={{ width: `${(l.v / LIMIT) * 100}%` }} title={`${l.k}: ${l.v} GB`} />
            ))}
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-7 gap-y-2">
            {link.map((l) => (
              <li key={l.k} className="label flex items-center gap-2.5">
                <span className={`inline-block h-2.5 w-2.5 ${l.c}`} />
                {l.k} · {l.v.toFixed(2)} GB
              </li>
            ))}
          </ul>
          <p className="label mt-4 !normal-case !tracking-normal">
            Forty 40,000 × 20,000-pixel images per sol at 8-bit depth and 10× compression drive the payload share — sized to fit
            the 3.5 GB/sol Mars-to-Earth link with turbo-coding overhead and a margin.
          </p>
        </Reveal>
      </CaseSection>

      <CaseSection n="06" label="Figures" title={<>Analysis, <span className="serif">plotted</span></>}>
        <FigureGallery items={figures} />
      </CaseSection>

      <CaseSection n="07" label="Documents" title={<>Read the <span className="serif">source</span></>}>
        <Documents
          docs={[
            {
              href: "/assets/projects/route-m/mission-summary.pdf",
              label: "ROUTE-M — space mission design report",
              detail: "ESSE 4361 · April 2026 · 62 pages: architecture, requirements, subsystem design, risk and budgets",
              size: "4.1 MB",
            },
            {
              href: "/assets/projects/route-m/Proposal-Presentation.pdf",
              label: "ROUTE-M — mission presentation",
              detail: "56 slides: the mission case, concept of operations and design trades",
              size: "23.8 MB",
            },
          ]}
        />
      </CaseSection>

      <NextProject current={p.slug} />
    </>
  );
}
