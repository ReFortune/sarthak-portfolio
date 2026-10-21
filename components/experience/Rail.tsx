"use client";

import { useStore } from "@/lib/store";
import { beatStore } from "@/lib/world-store";
import { beatIndex, RAIL } from "@/components/world/story";
import { jumpToBeat } from "./jump";

/** A thin rail down the right edge: one tick for each stop of the story. The current one reaches out; the rest wait. */
export default function Rail() {
  const active = useStore(beatStore);

  return (
    <nav aria-hidden="true" className="pointer-events-none fixed right-3 top-1/2 z-[56] hidden -translate-y-1/2 md:block lg:right-4">
      <ul className="flex flex-col items-end gap-[0.62rem]">
        {RAIL.map((r) => {
          const i = beatIndex(r.id);
          const next = RAIL.find((x) => beatIndex(x.id) > i);
          const on = active >= i && (!next || active < beatIndex(next.id));
          return (
            <li key={r.id} className="group pointer-events-auto relative flex items-center">
              <span className="label pointer-events-none absolute right-[calc(100%+0.8rem)] whitespace-nowrap !text-[0.62rem] opacity-0 transition-opacity duration-300 group-hover:opacity-100 [@media(hover:none)]:hidden">
                {r.label}
              </span>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => jumpToBeat(r.id)}
                className="flex h-5 w-8 items-center justify-end"
                data-cursor="link"
              >
                <span
                  className={`block h-px origin-right transition-all duration-500 ease-out group-hover:w-6 group-hover:bg-bone ${on ? "w-6 bg-laser" : "w-2.5 bg-bone/40"}`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
