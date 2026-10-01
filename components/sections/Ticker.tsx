import Marquee from "../ui/Marquee";
import { ticker } from "@/data/profile";

/** Headline figures scrolling past — every value comes straight from the résumé. */
export default function Ticker() {
  return (
    <section aria-label="Key figures" className="relative border-y border-bone/15 bg-ink py-6 md:py-8">
      <Marquee duration={90}>
        {ticker.map((t) => (
          <div key={t.label} className="flex shrink-0 items-center gap-4 px-7 md:gap-5 md:px-10">
            <span className="h-display text-[clamp(1.9rem,3.8vw,3.6rem)] text-bone">{t.value}</span>
            <span className="label max-w-[10.5rem] !leading-snug">{t.label}</span>
            <span aria-hidden="true" className="ml-3 text-laser md:ml-5">✦</span>
          </div>
        ))}
      </Marquee>
    </section>
  );
}
