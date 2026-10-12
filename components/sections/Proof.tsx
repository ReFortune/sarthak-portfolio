import Reveal from "../ui/Reveal";
import { TLink } from "../core/Transition";

/** Three results a first-time visitor can check in ten seconds — each one opens the work behind it. Figures match the case studies. */
const proofs = [
  {
    eyebrow: "Canadian Space Agency · LiDAR",
    stat: "3 cm",
    statLabel: "smallest obstacle the rover scanner detects",
    body: "Four pushbroom LiDAR configurations traded for Artemis 4 surface mapping — then built as an interactive scanner you can run.",
    cta: "Run the trade study",
    href: "/#pushbroom-lab",
    label: "Trade study",
  },
  {
    eyebrow: "NOVA · stratospheric balloon",
    stat: "40 km",
    statLabel: "flown on the CSA’s RSOnar III balloon",
    body: "Led a 6-person team to a sub-500 g payload that held 3.7 W peak against a 4 W power budget.",
    cta: "Read the case study",
    href: "/projects/nova-payload",
    label: "NOVA",
  },
  {
    eyebrow: "ROUTE-M · Mars orbiter",
    stat: "≤ 1 m",
    statLabel: "ground resolution across the whole planet",
    body: "A two-satellite stereo constellation with a 7-year design life, taken through to Critical Design Review.",
    cta: "Read the case study",
    href: "/projects/route-m",
    label: "ROUTE-M",
  },
] as const;

export default function Proof() {
  return (
    <section aria-labelledby="proof-title" data-section="top" className="relative pb-0 pt-16 md:pt-24">
      <div className="wrap">
        <Reveal className="mb-6 flex items-center justify-between gap-6 md:mb-8">
          <h2 id="proof-title" className="label label-strong">Results at a glance</h2>
          <p className="label hidden sm:block">Each card opens the work behind it</p>
        </Reveal>
        <Reveal selector="[data-proof]" stagger={0.1} className="grid gap-px border border-bone/10 bg-bone/10 md:grid-cols-3">
          {proofs.map((p) => (
            <TLink
              key={p.label}
              href={p.href}
              label={p.label}
              data-proof
              className="group flex min-h-[15rem] flex-col justify-between gap-8 bg-ink p-6 transition-colors duration-500 hover:bg-ink-2 focus-visible:bg-ink-2 md:p-8"
            >
              <div>
                <p className="label mb-6 flex items-center gap-2.5">
                  <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-laser" />
                  {p.eyebrow}
                </p>
                <p className="h-display text-[clamp(3rem,5.4vw,5rem)] leading-none">{p.stat}</p>
                <p className="label mt-3 !text-bone">{p.statLabel}</p>
              </div>
              <div>
                <p className="body text-[0.95rem]">{p.body}</p>
                <p className="label mt-5 inline-flex min-h-11 items-center gap-2 !text-bone">
                  {p.cta}
                  <span aria-hidden="true" className="transition-transform duration-500 group-hover:translate-x-1">→</span>
                </p>
              </div>
            </TLink>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
