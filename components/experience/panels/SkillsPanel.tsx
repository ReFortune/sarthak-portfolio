"use client";

import { useEffect, useState } from "react";
import { skillClusters } from "@/data/skills";
import { focusStore } from "@/lib/world-store";

/** The four skill groups, as a list to point at: whatever is pointed at lights up as a group of stars in the sky behind. */
export default function SkillsPanel() {
  const [hoverC, setHoverC] = useState<string | null>(null);
  const [pinC, setPinC] = useState<string | null>(null);
  const [skill, setSkill] = useState<string | null>(null);
  const cluster = hoverC ?? pinC;

  useEffect(() => {
    focusStore.set(skill ? `skill:${skill}` : cluster ? `cluster:${cluster}` : null);
  }, [cluster, skill]);
  useEffect(() => () => focusStore.set(null), []);

  return (
    <div className="grid gap-px bg-bone/10" onPointerLeave={() => { setHoverC(null); setSkill(null); }}>
      {skillClusters.map((c) => {
        const on = cluster === c.id;
        return (
          <div
            key={c.id}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHoverC(c.id)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setHoverC(null)}
            onFocus={() => setHoverC(c.id)}
            onBlur={() => setHoverC(null)}
            className={`bg-ink-2 px-4 py-3 transition-colors duration-500 ${on ? "!bg-ink-3" : ""}`}
          >
            <button
              type="button"
              aria-pressed={pinC === c.id}
              onClick={() => setPinC((p) => (p === c.id ? null : c.id))}
              data-cursor="link"
              className="block w-full text-left"
            >
              <span className="mb-1 flex items-baseline justify-between gap-4">
                <span className="h-title text-[1.02rem]">{c.name}</span>
                <span className={`label tnum transition-colors ${on ? "!text-laser" : "text-laser"}`}>{String(c.skills.length).padStart(2, "0")}</span>
              </span>
              <span className="serif block text-[0.95rem] leading-tight text-bone-dim">{c.blurb}</span>
            </button>
            <ul className="mt-2 flex flex-wrap gap-1">
              {c.skills.map((s) => (
                <li key={s}>
                  <span
                    onPointerEnter={(e) => e.pointerType === "mouse" && setSkill(s)}
                    onPointerLeave={(e) => e.pointerType === "mouse" && setSkill(null)}
                    className={`chip !px-2 !py-0.5 !text-[0.66rem] transition-colors ${skill === s ? "!border-laser !text-laser" : ""}`}
                  >
                    {s}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
