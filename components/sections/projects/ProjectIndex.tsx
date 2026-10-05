"use client";

import type { MouseEvent } from "react";
import { projects } from "@/data/projects";
import { scrollToTarget } from "@/lib/scroll";
import Reveal from "../../ui/Reveal";

/**
 * Where to scroll so card `i` sits exactly where it pins. Sticky cards move, so their rect can't be trusted: rebuild the
 * natural offset from the stack's own top, the cards' heights and the gaps between them (heights ignore sticky).
 */
function targetFor(i: number): number | null {
  const cards = [...document.querySelectorAll<HTMLElement>("[data-stack-card]")];
  const card = cards[i];
  const stack = card?.parentElement;
  if (!card || !stack) return null;
  const cs = getComputedStyle(card);
  if (cs.position !== "sticky") return card.getBoundingClientRect().top + window.scrollY - 96; // stacked, not pinned (phones)
  let y = stack.getBoundingClientRect().top + window.scrollY;
  for (let k = 0; k < i; k++) y += cards[k].getBoundingClientRect().height + (parseFloat(getComputedStyle(cards[k + 1]).marginTop) || 0);
  return y - (parseFloat(cs.top) || 0) + 2;
}

/** A compact index of every project, above the sticky stack — so a six-screen scroll never has to be a blind one. */
export default function ProjectIndex() {
  const go = (i: number) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const y = targetFor(i);
    if (y === null) return;
    e.preventDefault();
    scrollToTarget(y, { duration: 1.7 });
  };

  return (
    <Reveal className="mb-16 md:mb-24">
      <nav aria-label="Project index">
        <p className="label mb-4 flex items-center justify-between">
          <span>Jump to a project</span>
          <span className="tnum">{String(projects.length).padStart(2, "0")} in all</span>
        </p>
        <ol className="divide-y divide-bone/10 border-y border-bone/10">
          {projects.map((p, i) => (
            <li key={p.slug}>
              <a
                href={`#proj-${p.slug}`}
                onClick={go(i)}
                className="group grid grid-cols-[2.2rem_1fr_auto] items-baseline gap-x-4 py-3.5 md:grid-cols-[3.2rem_minmax(0,15rem)_1fr_10.5rem_7.5rem] md:py-[1.05rem]"
              >
                <span className="label tnum !text-laser">{p.n}</span>
                <span className="h-display text-[clamp(1.35rem,2.4vw,2.2rem)] leading-none transition-[padding,color] duration-500 ease-out group-hover:pl-3 group-hover:text-laser group-focus-visible:pl-3 group-focus-visible:text-laser">
                  {p.code}
                  <span className="sr-only"> — {p.name}</span>
                </span>
                <span className="label hidden md:block">{p.kind}</span>
                <span className="label tnum hidden md:block">{p.period}</span>
                <span className="label flex items-center justify-end gap-2.5 text-right">
                  {p.status === "Active" && <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-laser [animation:blink_1.4s_infinite]" />}
                  <span className={p.status === "Active" ? "!text-laser" : undefined}>{p.status}</span>
                  <span aria-hidden="true" className="inline-block text-bone transition-transform duration-500 group-hover:translate-y-0.5">↓</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </Reveal>
  );
}
