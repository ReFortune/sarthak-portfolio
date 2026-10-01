"use client";

import { useRef } from "react";
import { gsap } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";

const FROM = 6;
const TO = 20;

/** 20 seats: the original 6 are lit, the other 14 light up in sequence as the counter climbs. */
export default function TeamGrowth() {
  const root = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);

  useGsap(root, ({ motion }) => {
    if (!motion) return;
    const dots = root.current!.querySelectorAll<HTMLElement>("[data-new]");
    gsap.set(dots, { opacity: 0.18, scale: 0.6, backgroundColor: "transparent" });
    const o = { n: FROM };
    const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 82%", once: true } });
    tl.to(dots, { opacity: 1, scale: 1, backgroundColor: "rgb(255 91 46)", duration: 0.5, stagger: 0.13, ease: "back.out(2)" }, 0.15)
      .to(o, { n: TO, duration: 0.13 * (TO - FROM) + 0.3, ease: "none", onUpdate: () => { if (count.current) count.current.textContent = String(Math.round(o.n)); } }, 0.15);
  }, []);

  return (
    <div ref={root}>
      <div className="grid grid-cols-10 gap-2 sm:gap-2.5" role="img" aria-label={`Team grew from ${FROM} to ${TO} members`}>
        {Array.from({ length: TO }).map((_, i) => (
          <span
            key={i}
            data-new={i >= FROM ? "" : undefined}
            className={`aspect-square rounded-full border ${i < FROM ? "border-bone bg-bone" : "border-laser bg-laser"}`}
          />
        ))}
      </div>
      <p className="mt-5 flex items-baseline gap-3">
        <span className="h-display text-[clamp(2.6rem,5vw,4.6rem)] leading-none tnum">
          {FROM} <span className="text-laser">→</span> <span ref={count}>{TO}</span>
        </span>
        <span className="label">members</span>
      </p>
    </div>
  );
}
