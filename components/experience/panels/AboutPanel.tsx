"use client";

import { useState } from "react";
import { profile } from "@/data/profile";
import { aboutBeats, aboutFacts } from "@/data/about";
import PortraitLens from "../../sections/PortraitLens";

/** Who this is: the photo (point at it and a LiDAR loupe redraws it as returns), the facts, and the three short answers. */
export default function AboutPanel() {
  const [i, setI] = useState(0);
  const b = aboutBeats[i];
  return (
    <div className="p-4">
      <div className="grid grid-cols-[8.5rem_1fr] items-start gap-4">
        <figure>
          <PortraitLens src="/assets/about/headshot.jpg" alt={`${profile.name} (${profile.pronouns})`} />
          <figcaption className="label mt-1.5 !text-[0.62rem] [@media(pointer:coarse)]:hidden">Hover to scan</figcaption>
        </figure>
        <dl className="divide-y divide-bone/10 border-y border-bone/10">
          {aboutFacts.slice(0, 3).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[4.4rem_1fr] gap-3 py-2">
              <dt className="label pt-0.5 !text-[0.66rem]">{k}</dt>
              <dd className="text-[0.8rem] leading-snug text-bone">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div role="tablist" aria-label="About me" className="mt-5 flex flex-wrap gap-2">
        {aboutBeats.map((x, k) => (
          <button
            key={x.n}
            type="button"
            role="tab"
            id={`about-tab-${x.n}`}
            aria-selected={k === i}
            aria-controls="about-panel"
            onClick={() => setI(k)}
            data-cursor="link"
            className={`label border border-solid px-3 py-2 transition-colors ${k === i ? "border-laser bg-laser/10 !text-bone" : "border-bone/20 hover:border-bone/60"}`}
          >
            <span className="mr-2 text-laser">{x.n}</span>
            {x.title}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="about-panel" aria-labelledby={`about-tab-${b.n}`} className="mt-4 min-h-[9.5rem]">
        <p className="text-[0.88rem] leading-[1.6] text-bone-dim">{b.body}</p>
      </div>
    </div>
  );
}
