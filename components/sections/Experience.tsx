import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import CountUp from "../ui/CountUp";
import SplitReveal from "../ui/SplitReveal";
import ScanFrame from "../ui/ScanFrame";
import PushbroomLab from "./lab/PushbroomLab";
import CoasterVisual from "./CoasterVisual";
import { experience, type Experience as Exp } from "@/data/experience";

const csa = experience.find((e) => e.id === "csa")!;
const wonderland = experience.find((e) => e.id === "wonderland")!;

export default function Experience() {
  return (
    <section id="experience" data-section="experience" className="relative py-28 md:py-44">
      <div className="wrap">
        <SectionHead
          n="02"
          label="Experience"
          title={
            <>
              Flight <span className="serif">log</span>
            </>
          }
          lede="Two internships, one through-line: make the measurement trustworthy, then make the machine that depends on it reliable."
        />

        {/* ───────── Canadian Space Agency ───────── */}
        <article aria-labelledby="csa-title">
          <EntryHead exp={csa} id="csa-title" />

          <div className="mt-14 divide-y divide-bone/10 border-y border-bone/10 md:mt-20">
            {/* A */}
            <Finding letter="A" title={csa.findings[0].title} body={csa.findings[0].body}>
              <div className="grid grid-cols-3 gap-px bg-bone/10">
                {[
                  { to: 1, unit: "cm", label: "ranging accuracy" },
                  { to: 3, unit: "cm", label: "min. detectable obstacle" },
                  { to: 20, unit: "m", label: "max. scan range" },
                ].map((m) => (
                  <div key={m.label} className="bg-ink p-4 md:p-6">
                    <p className="h-display flex items-baseline gap-1.5 text-[clamp(2.2rem,4.4vw,4.6rem)]">
                      <CountUp to={m.to} />
                      <span className="serif text-[0.42em] normal-case text-bone-dim">{m.unit}</span>
                    </p>
                    <p className="label mt-3">{m.label}</p>
                  </div>
                ))}
              </div>
              <p className="label mt-4 !normal-case !tracking-normal">
                Sensor: SICK LMS111-10100 · supports a TRL increase for off-world navigation &amp; landing
              </p>
            </Finding>

            {/* B */}
            <Finding letter="B" title={csa.findings[1].title} body={csa.findings[1].body}>
              <div className="grid grid-cols-[auto_1fr_1fr] items-stretch gap-px bg-bone/10">
                <div className="bg-ink p-3" />
                {[0.25, 0.5].map((inc) => (
                  <div key={inc} className="label bg-ink p-3 text-center !text-bone">{inc}° increment</div>
                ))}
                {[25, 50].map((rate) => (
                  <ConfigRow key={rate} rate={rate} />
                ))}
              </div>
              <p className="label mt-4 !normal-case !tracking-normal">
                Four configurations, traded across pitch angles and traverse speeds for NASA’s Artemis 4 surface mapping.{" "}
                <a href="#pushbroom-lab" className="link !text-bone">Try it below ↓</a>
              </p>
            </Finding>

            {/* C */}
            <Finding letter="C" title={csa.findings[2].title} body={csa.findings[2].body}>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 border border-dashed border-bone/25 px-4 py-3 text-bone-mute">
                  <span className="text-sm line-through decoration-laser decoration-2">Contracted third-party scanning service</span>
                  <span className="label">Replaced</span>
                </div>
                <ol className="grid grid-cols-3 gap-2">
                  {["Scanning module", "Python processing pipeline", "Point-cloud viewer"].map((step, i) => (
                    <li key={step} className="relative border border-bone/25 bg-ink-2 p-4">
                      <span className="label tnum text-laser">0{i + 1}</span>
                      <span className="mt-2 block text-[0.85rem] leading-snug">{step}</span>
                      {i < 2 && (
                        <span aria-hidden="true" className="absolute -right-[0.95rem] top-1/2 z-10 -translate-y-1/2 bg-ink px-0.5 text-laser">›</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
              <p className="label mt-4 !normal-case !tracking-normal">In-house, end to end: from the laser to the screen.</p>
            </Finding>
          </div>

          <Reveal className="mt-20 md:mt-28" y={60}>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="label mb-3">Interactive · first principles</p>
                <h3 className="h-title text-[clamp(1.7rem,3.4vw,3rem)]">
                  Run the <span className="serif">trade study</span>
                </h3>
              </div>
              <p className="lede max-w-xl !text-[1rem]">
                Fire a virtual pushbroom scanner over a patch of ground with three 3&nbsp;cm rocks. Change the scan rate and
                angular increment and watch how far across the track the smallest obstacle stays visible.
              </p>
            </div>
            <PushbroomLab />
          </Reveal>
        </article>

        {/* ───────── Canada's Wonderland ───────── */}
        <article aria-labelledby="wonder-title" className="mt-32 md:mt-48">
          <EntryHead exp={wonderland} id="wonder-title" />
          <div className="mt-14 grid gap-12 md:mt-20 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-5">
              <div className="divide-y divide-bone/10 border-y border-bone/10">
                {wonderland.findings.map((f, i) => (
                  <Reveal key={f.title} className="py-7" delay={i * 0.08}>
                    <p className="label mb-4 flex items-center justify-between">
                      <span className="label-strong">{f.title}</span>
                      <span className="tnum text-laser">{String.fromCharCode(65 + i)}</span>
                    </p>
                    <p className="body">{f.body}</p>
                    {f.metrics && (
                      <dl className="mt-5 flex gap-8">
                        {f.metrics.map((m) => (
                          <div key={m.label}>
                            <dd className="h-display text-[clamp(1.8rem,3vw,2.8rem)]">{m.value}</dd>
                            <dt className="label mt-1.5">{m.label}</dt>
                          </div>
                        ))}
                      </dl>
                    )}
                  </Reveal>
                ))}
              </div>
            </div>
            <div className="lg:col-span-7">
              <ScanFrame>
                <div className="window ticks p-5 md:p-7">
                  <p className="label mb-5 flex items-center justify-between">
                    <span>Fig. — Structural &amp; mechanical diagnostics</span>
                    <span className="hidden sm:inline">Schematic</span>
                  </p>
                  <CoasterVisual />
                </div>
              </ScanFrame>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

/* ── pieces ────────────────────────────────────────────────────────────── */

function EntryHead({ exp, id }: { exp: Exp; id: string }) {
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="label mb-5 flex items-center gap-3">
          {exp.current ? (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-laser [animation:blink_1.4s_infinite]" />
              Active
            </>
          ) : (
            "Completed"
          )}
          <span className="text-bone-mute">·</span>
          {exp.type}
        </p>
        <SplitReveal as="h3" id={id} className="h-display text-[clamp(2.4rem,7vw,7.5rem)] !leading-[0.92]">
          {exp.org}
        </SplitReveal>
        <p className="lede mt-5 !text-bone">{exp.role}</p>
      </div>
      <p className="label tnum md:pb-3 md:text-right">{exp.period}</p>
    </header>
  );
}

function Finding({
  letter,
  title,
  body,
  children,
}: {
  letter: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal className="grid gap-8 py-10 md:py-14 lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-2">
        <p className="label flex items-center gap-3 lg:flex-col lg:items-start lg:gap-3">
          <span className="h-display text-[2.4rem] leading-none text-laser">{letter}</span>
          <span className="label-strong">{title}</span>
        </p>
      </div>
      <p className="body text-[1.02rem] lg:col-span-5">{body}</p>
      <div className="lg:col-span-5">{children}</div>
    </Reveal>
  );
}

/** One scan-rate row of the 2×2 trade matrix: data rate + point spacing at 1 m (270° field of view). */
function ConfigRow({ rate }: { rate: number }) {
  return (
    <>
      <div className="label grid place-items-center bg-ink px-3 !text-bone">{rate} Hz</div>
      {[0.25, 0.5].map((inc) => {
        const perScan = Math.round(270 / inc) + 1;
        const pps = rate * perScan;
        const spacing = (inc * Math.PI) / 180 * 1000; // mm at 1 m range
        return (
          <div key={inc} className="bg-ink-2 p-4">
            <p className="h-display text-[clamp(1.25rem,2vw,1.9rem)] leading-none">
              {(pps / 1000).toFixed(1)}k <span className="label !normal-case">pts/s</span>
            </p>
            <p className="label mt-2.5 !normal-case !tracking-normal">
              {spacing.toFixed(1)} mm spacing at 1 m · {perScan} pts/scan
            </p>
          </div>
        );
      })}
    </>
  );
}
