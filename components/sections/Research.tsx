import Image from "next/image";
import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import CountUp from "../ui/CountUp";
import ScanFrame from "../ui/ScanFrame";
import TransitLab from "./research/TransitLab";
import { research } from "@/data/research";

const { numbers, paper } = research;
const AXIS = 75000;

export default function Research() {
  return (
    <section id="research" data-section="research" className="relative py-28 md:py-44">
      <div className="wrap">
        <SectionHead
          n="05"
          label="Research"
          title={
            <>
              A planet, <span className="serif">from starlight</span>
            </>
          }
          lede="Nothing but photons from a star ~530 light-years away: 706 CCD frames, one 6-hour transit, and a pipeline that turns them into the size of a world."
        />

        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          {/* ── the work ── */}
          <div className="lg:col-span-5">
            <Reveal>
              <p className="label mb-4">Research project · {research.period} · {research.org}</p>
              <h3 className="h-title text-[clamp(1.45rem,2.3vw,2.05rem)] !leading-[1.12]">{research.title}</h3>
            </Reveal>

            {/* result: computed vs published */}
            <Reveal className="mt-10" delay={0.05}>
              <div className="border-y border-bone/10 py-6">
                <p className="label mb-5">Planetary radius</p>
                <div className="space-y-4">
                  <Bar label="Computed from the light curve" km={numbers.radiusKm} accent />
                  <Bar label="Published value" km={numbers.publishedRadiusKm} />
                </div>
                <div className="mt-6 flex items-baseline justify-between gap-6">
                  <p className="h-display text-[clamp(2.6rem,5vw,4.6rem)] leading-none">
                    <CountUp to={numbers.percentOff} decimals={1} suffix="%" />
                  </p>
                  <p className="label max-w-[13rem] text-right !leading-snug">
                    from the published radius, alongside transit depth and ingress / egress durations
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal className="mt-8" selector="li" stagger={0.1}>
              <ul className="space-y-4">
                {research.bullets.map((b) => (
                  <li key={b} className="body flex gap-4 text-[0.97rem]">
                    <span aria-hidden="true" className="mt-[0.7em] h-px w-5 shrink-0 bg-laser" />
                    {b}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-bone/10 pt-6" selector="div" stagger={0.06}>
              {[
                ["Observed", paper.observed],
                ["Distance", `≈ ${paper.distanceLy} light-years`],
                ["Telescope", paper.telescope],
                ["Calibration", paper.calibration],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="label">{k}</p>
                  <p className="mt-1 text-[0.9rem] leading-snug text-bone">{v}</p>
                </div>
              ))}
            </Reveal>

            <Reveal className="mt-8 flex flex-wrap items-center gap-2" selector="li" stagger={0.05}>
              <ul className="flex flex-wrap gap-2" aria-label="Tools">
                {research.tools.map((t) => (
                  <li key={t} className="chip">{t}</li>
                ))}
              </ul>
            </Reveal>

            <Reveal className="mt-9 flex flex-wrap items-center gap-3">
              <a href={research.pdf} download="Sahai-HAT-P-18b-Transit.pdf" className="btn btn--solid">
                Download the paper <span aria-hidden="true" className="arrow">↓</span>
              </a>
              <a href={research.pdf} target="_blank" rel="noopener noreferrer" className="btn">
                Read online <span aria-hidden="true" className="arrow">↗</span>
              </a>
            </Reveal>
          </div>

          {/* ── the instrument ── */}
          <div className="space-y-6 lg:col-span-7">
            <Reveal y={60}>
              <TransitLab />
            </Reveal>
            <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-end">
              <ScanFrame className="w-full sm:w-44">
                <figure>
                  <div className="ticks relative aspect-square w-full overflow-hidden bg-black">
                    <Image src="/assets/publications/star-field.webp" alt="One of the 706 aligned CCD frames: the star field around HAT-P-18" fill sizes="(min-width: 640px) 11rem, 90vw" className="object-cover" />
                  </div>
                  <figcaption className="label mt-2">Aligned CCD frame</figcaption>
                </figure>
              </ScanFrame>
              <Reveal>
                <p className="label !normal-case !tracking-normal !leading-relaxed">
                  The transit lab re-plots the flux from Figure 6.1 of the original report: the dots are the per-frame
                  measurements, the line is the report’s own best fit, and the planet’s path uses the contact frames marked
                  there (ingress 100 → 250, egress 550 → 670). The planet-to-star size ratio comes from the 69,112 km radius
                  and the 0.75 R☉ stellar radius the analysis adopted. Transit depth: {paper.depthPercent}% · {paper.radiusJupiter} R<sub>J</sub> ·{" "}
                  {paper.radiusEarth} R<sub>⊕</sub>.
                </p>
              </Reveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Bar({ label, km, accent = false }: { label: string; km: number; accent?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 flex items-baseline justify-between gap-4">
        <span className="label">{label}</span>
        <span className={`h-display text-[1.2rem] tnum ${accent ? "text-laser" : ""}`}>{km.toLocaleString("en-US")} <span className="serif text-[0.6em] text-bone-dim">km</span></span>
      </p>
      <span className="relative block h-2 bg-bone/10">
        <span className={`absolute inset-y-0 left-0 ${accent ? "bg-laser" : "bg-bone/60"}`} style={{ width: `${(km / AXIS) * 100}%` }} />
      </span>
    </div>
  );
}
