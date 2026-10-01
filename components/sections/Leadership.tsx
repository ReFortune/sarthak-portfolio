import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import CountUp from "../ui/CountUp";
import SplitReveal from "../ui/SplitReveal";
import TrussBridge from "./leadership/TrussBridge";
import TeamGrowth from "./leadership/TeamGrowth";
import { leadership } from "@/data/leadership";

const bridge = leadership.find((l) => l.id === "steel-bridge")!;
const gnctr = leadership.find((l) => l.id === "gnctr")!;
const les = leadership.find((l) => l.id === "les")!;

export default function Leadership() {
  return (
    <section id="leadership" data-section="leadership" className="relative py-28 md:py-44">
      <div className="wrap">
        <SectionHead
          n="04"
          label="Leadership"
          title={
            <>
              Leading <span className="serif">teams</span>
            </>
          }
          lede="Design teams taught me the other half of engineering: people, budgets and deadlines. Plus a national stage, a toboggan design that was reused, and two years running student life for Lassonde engineers."
        />

        {/* ───────── Steel Bridge ───────── */}
        <article aria-labelledby="bridge-title">
          <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="label mb-5 flex flex-wrap items-center gap-3">
                {bridge.role}
                <span className="text-bone-mute">·</span>
                {bridge.place}
                <span className="hidden text-bone-mute sm:inline">·</span>
                <span className="hidden tnum sm:inline">{bridge.coords}</span>
              </p>
              <SplitReveal as="h3" id="bridge-title" className="h-display text-[clamp(2.3rem,6.4vw,6.6rem)] !leading-[0.94]">
                {bridge.org}
              </SplitReveal>
            </div>
            <p className="label tnum md:pb-3 md:text-right">{bridge.period}</p>
          </header>

          <div className="mt-14 grid gap-12 md:mt-20 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-5">
              <Reveal selector="li" stagger={0.12}>
                <ol className="divide-y divide-bone/10 border-y border-bone/10">
                  {bridge.bullets.map((b, i) => (
                    <li key={b} className="grid grid-cols-[2.5rem_1fr] gap-4 py-6">
                      <span className="h-display text-[1.6rem] leading-none text-laser tnum">0{i + 1}</span>
                      <p className="body text-[0.98rem]">{b}</p>
                    </li>
                  ))}
                </ol>
              </Reveal>
            </div>
            <div className="lg:col-span-7">
              <Reveal y={60}>
                <TrussBridge />
              </Reveal>
            </div>
          </div>

          <div className="mt-14 grid gap-px bg-bone/10 md:mt-20 md:grid-cols-3">
            <Reveal className="bg-ink p-6 md:p-8">
              <p className="label mb-6">Team</p>
              <TeamGrowth />
            </Reveal>
            <Reveal className="bg-ink p-6 md:p-8" delay={0.08}>
              <p className="label mb-6">Funding</p>
              <p className="h-display text-[clamp(2.6rem,5vw,4.6rem)] leading-none">
                <CountUp to={35000} prefix="$" />
              </p>
              <p className="label mt-5 max-w-[17rem] !leading-snug">
                in external sponsorships &amp; industry collaborations, shifted from member donations
              </p>
            </Reveal>
            <Reveal className="bg-ink p-6 md:p-8" delay={0.16}>
              <p className="label mb-6">Competition</p>
              <p className="h-display text-[clamp(2.6rem,5vw,4.6rem)] leading-none">
                20 <span className="serif text-[0.5em] normal-case text-bone-dim">ft</span>
              </p>
              <p className="label mt-5 max-w-[17rem] !leading-snug">
                steel bridge, entered against engineering schools from across Canada at nationals in Moncton, NB
              </p>
            </Reveal>
          </div>
        </article>

        {/* ───────── GNCTR ───────── */}
        <article aria-labelledby="gnctr-title" className="mt-32 md:mt-48">
          <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="label mb-5 flex flex-wrap items-center gap-3">
                {gnctr.role}
                <span className="text-bone-mute">·</span>
                {gnctr.place}
              </p>
              <SplitReveal as="h3" id="gnctr-title" className="h-display text-[clamp(2.3rem,6.4vw,6.6rem)] !leading-[0.94]">
                Great Northern Concrete Toboggan Race
              </SplitReveal>
            </div>
            <p className="label tnum md:pb-3 md:text-right">{gnctr.period}</p>
          </header>

          <div className="mt-14 grid gap-12 md:mt-20 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-5">
              <Reveal selector="p" stagger={0.12}>
                <div className="divide-y divide-bone/10 border-y border-bone/10">
                  {gnctr.bullets.map((b) => (
                    <p key={b} className="body py-6 text-[0.98rem]">{b}</p>
                  ))}
                </div>
              </Reveal>
            </div>

            <Reveal className="lg:col-span-7" selector="[data-plaque]" stagger={0.12}>
              <div className="grid gap-px bg-bone/10 sm:grid-cols-2">
                {gnctr.awards!.map((a) => (
                  <div key={a} data-plaque className="ticks relative bg-ink-2 p-7 md:p-9">
                    <p className="label mb-10 flex items-center justify-between">
                      <span>Award</span>
                      <span aria-hidden="true" className="text-laser">★</span>
                    </p>
                    <p className="h-display text-[clamp(1.9rem,3.4vw,3.2rem)] !leading-[0.98]">{a}</p>
                  </div>
                ))}
                <div data-plaque className="bg-ink-2 p-7 sm:col-span-2 md:p-9">
                  <div className="flex flex-wrap items-end justify-between gap-6">
                    <div>
                      <p className="label mb-5">Press</p>
                      <p className="h-display text-[clamp(1.7rem,3vw,2.8rem)] !leading-none">
                        Featured in a <span className="serif">CP24</span> news segment
                      </p>
                    </div>
                    <p className="label flex max-w-xs items-start gap-3 !leading-snug">
                      <span aria-hidden="true" className="text-laser">↻</span>
                      Steering &amp; braking design carried over and reused by the following year’s team
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </article>

        {/* ───────── Lassonde Engineering Society ───────── */}
        <article aria-labelledby="les-title" className="mt-32 md:mt-48">
          <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="label mb-5 flex flex-wrap items-center gap-3">
                {les.role}
                <span className="text-bone-mute">·</span>
                {les.place}
              </p>
              <SplitReveal as="h3" id="les-title" className="h-display text-[clamp(2.3rem,6.4vw,6.6rem)] !leading-[0.94]">
                {les.org}
              </SplitReveal>
            </div>
            <p className="label tnum md:pb-3 md:text-right">{les.period}</p>
          </header>
        </article>
      </div>
    </section>
  );
}
