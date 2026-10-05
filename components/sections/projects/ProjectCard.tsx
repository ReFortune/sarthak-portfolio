import type { Project } from "@/data/projects";
import { TLink } from "../../core/Transition";
import Visual from "./Visual";
import MetricValue from "../../ui/MetricValue";

const FIG_TITLES: Record<Project["visual"], string> = {
  nova: "Ascent profile & qualification",
  route: "Mars orbit & coverage (illustrative)",
  oscar: "Ocean-colour spectral response (illustrative)",
  sparrow: "Sensor-agnostic mast interface",
  planner: "Live route planner (illustrative)",
  chiron: "Prototype & corridor navigation logic",
};

export default function ProjectCard({ p, index }: { p: Project; index: number }) {
  return (
    <article
      data-stack-card
      aria-labelledby={`proj-${p.slug}`}
      className="stack-card"
      style={{ ["--i" as string]: index }}
    >
      <div
        data-card-inner
        className="relative grid overflow-hidden rounded-[1.25rem] border border-bone/12 bg-ink-2 shadow-[0_-30px_80px_-20px_rgb(0_0_0/0.6)] lg:min-h-[min(84svh,790px)] lg:grid-cols-12"
      >
        {/* ── copy ── */}
        <div className="pc-pad flex flex-col justify-between gap-9 p-6 sm:p-8 lg:col-span-5 lg:p-10 xl:p-12">
          <div>
            <p className="pc-kind label mb-8 flex items-center justify-between gap-4 sm:mb-10">
              <span className="flex items-center gap-3">
                <span className="tnum text-laser">{p.n}</span>
                <span aria-hidden="true">—</span>
                {p.kind}
              </span>
              <span className={`chip ${p.status === "Active" ? "!border-laser/60 !text-laser" : ""}`}>
                {p.status === "Active" && <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-laser [animation:blink_1.4s_infinite]" />}
                {p.status}
              </span>
            </p>

            <h3 id={`proj-${p.slug}`} className="pc-title h-display text-[clamp(2.7rem,5.4vw,6rem)]">
              {p.code}
            </h3>
            <p className="serif mt-3 text-[clamp(1.15rem,1.6vw,1.6rem)] leading-tight text-bone-dim">{p.name}</p>

            <dl className="pc-dl mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-bone/10 pt-5">
              {[
                ["Role", p.role],
                ["Team", p.team],
                ["Period", p.period],
                ["With", p.org],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="label">{k}</dt>
                  <dd className="mt-1 text-[0.9rem] leading-snug text-bone">{v}</dd>
                </div>
              ))}
            </dl>

            <p className="pc-summary body mt-7 text-[0.97rem]">{p.summary}</p>
          </div>

          <div>
            <dl className={`pc-metrics gap-x-8 gap-y-5 ${p.metrics.length >= 4 ? "grid grid-cols-2" : "flex flex-wrap"}`}>
              {p.metrics.slice(0, 4).map((m) => (
                <div key={m.label}>
                  <dd className="h-display text-[clamp(1.4rem,2vw,2rem)] leading-none"><MetricValue value={m.value} /></dd>
                  <dt className="label mt-2 max-w-[7.5rem] !leading-snug">{m.label}</dt>
                </div>
              ))}
            </dl>
            <div className="pc-cta mt-8 flex flex-wrap items-center gap-3">
              {p.caseStudy ? (
                <TLink href={`/projects/${p.slug}`} label={p.code} className="btn btn--solid" data-cursor="link">
                  Open case study <span aria-hidden="true" className="arrow">↗</span>
                </TLink>
              ) : (
                <ul className="flex flex-wrap gap-2" aria-label="Focus areas">
                  {p.tags.slice(0, 4).map((t) => (
                    <li key={t} className="chip">{t}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ── visual ── */}
        <div className={`relative ${p.visual === "planner" ? "min-h-[46rem]" : "min-h-[26rem]"} border-t border-bone/10 bg-ink lg:col-span-7 lg:min-h-0 lg:border-l lg:border-t-0`}>
          <div className="absolute inset-0 flex flex-col">
            <div className="flex items-center justify-between border-b border-bone/10 px-4 py-3 md:px-5">
              <p className="label label-strong">Fig. {p.n} — {FIG_TITLES[p.visual]}</p>
              <p className="label hidden sm:block">{p.code}</p>
            </div>
            <div className="relative flex-1 overflow-hidden">
              <Visual kind={p.visual} />
            </div>
          </div>
        </div>

        {/* dimming veil used by the stack's recede effect (see ProjectStack) */}
        <span data-card-dim aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 bg-ink opacity-0" />
      </div>
    </article>
  );
}
