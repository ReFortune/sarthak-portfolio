import { TLink } from "../core/Transition";
import SplitReveal from "../ui/SplitReveal";
import Reveal from "../ui/Reveal";
import Visual from "../sections/projects/Visual";
import type { Project } from "@/data/projects";

/** Case-study opener: title block + the project's own instrument from the home page, at full size. */
export default function CaseHero({ p }: { p: Project }) {
  return (
    <header className="relative pb-16 pt-28 md:pb-24 md:pt-32">
      <div className="wrap">
        <Reveal className="mb-10 flex items-center justify-between gap-6 md:mb-14">
          <TLink href="/#projects" label="Projects" className="label link !text-bone">
            ← All projects
          </TLink>
          <p className="label tnum hidden sm:block">
            Case study {p.n} / 05
          </p>
        </Reveal>

        <div className="grid items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="flex flex-col justify-between gap-10 lg:col-span-5">
            <div>
              <p className="label mb-6 flex flex-wrap items-center gap-3">
                <span className="text-laser tnum">{p.n}</span>
                <span aria-hidden="true">—</span>
                {p.kind}
                <span className={`chip ${p.status === "Active" ? "!border-laser/60 !text-laser" : ""}`}>{p.status}</span>
              </p>
              <SplitReveal as="h1" afterBoot={false} className="h-display whitespace-nowrap text-[clamp(2.6rem,6.4vw,7.2rem)] !leading-[0.9]" duration={1.4}>
                {p.code}
              </SplitReveal>
              <p className="serif mt-5 text-[clamp(1.3rem,2.1vw,2rem)] leading-tight text-bone-dim">{p.name}</p>
              <Reveal delay={0.2}>
                <p className="lede mt-8 max-w-xl">{p.summary}</p>
              </Reveal>
            </div>

            <Reveal delay={0.3}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-bone/10 pt-6">
                {[
                  ["Role", p.role],
                  ["Team", p.team],
                  ["Period", p.period],
                  ["With", p.org],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="label">{k}</dt>
                    <dd className="mt-1 text-[0.92rem] leading-snug text-bone">{v}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          <Reveal className="lg:col-span-7" y={60} delay={0.15}>
            <div className="window ticks relative h-[min(74svh,41rem)] min-h-[30rem]">
              <div className="absolute inset-0 flex flex-col">
                <div className="flex items-center justify-between border-b border-bone/10 px-4 py-3 md:px-5">
                  <p className="label label-strong">Instrument · {p.code}</p>
                  <p className="label hidden sm:block">Interactive</p>
                </div>
                <div className="relative flex-1 overflow-hidden">
                  <Visual kind={p.visual} />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </header>
  );
}
