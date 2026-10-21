"use client";

import type { ReactNode } from "react";
import { dossierStore, type DossierRef } from "@/lib/world-store";

/* Small pieces the beats are made of, in the site's own idiom: mono labels, expanded display type, a serif italic. */

type Fig = { value: string; label: string };

/** The block of copy for a beat. `align` places it on the left or right of the screen (full width on a phone). */
export function Copy({
  eyebrow,
  title,
  body,
  figs,
  actions,
  align = "left",
  size = "md",
  valign = "center",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  figs?: Fig[];
  actions?: ReactNode;
  align?: "left" | "right";
  size?: "md" | "lg";
  valign?: "center" | "top" | "bottom";
}) {
  const right = align === "right";
  const justify = valign === "top" ? "justify-start" : valign === "bottom" ? "justify-end" : "justify-center";
  return (
    <div className={`wrap flex h-full flex-col pb-[clamp(4.5rem,9vh,6rem)] pt-[clamp(6rem,13vh,8.5rem)] ${justify}`}>
      <div className={`max-w-[34rem] md:max-w-[38rem] ${right ? "lg:ml-auto" : ""}`}>
        {eyebrow && (
          <p className="label label-strong mb-5 flex items-center gap-3">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-laser [animation:blink_1.4s_infinite]" />
            {eyebrow}
          </p>
        )}
        <h2 className={`h-display ${size === "lg" ? "text-d-sm" : "text-[clamp(1.9rem,3.6vw,3.2rem)]"} text-balance`}>{title}</h2>
        {body && <p className="lede mt-6 max-w-[32rem]">{body}</p>}
        {figs && figs.length > 0 && (
          <dl className="mt-8 flex flex-wrap gap-x-9 gap-y-5 border-t border-bone/15 pt-5">
            {figs.map((f) => (
              <div key={f.label}>
                <dt className="sr-only">{f.label}</dt>
                <dd className="flex items-baseline gap-3">
                  <span className="h-display whitespace-nowrap text-[clamp(1.7rem,3vw,2.6rem)] text-bone">{f.value}</span>
                  <span className="label max-w-[9.5rem] !leading-snug" aria-hidden="true">{f.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {actions && <div className="[pointer-events:var(--pe,auto)] mt-8 flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}

/** Opens the dossier drawer on a record. */
export function DossierButton({ to, children, solid }: { to: DossierRef; children: ReactNode; solid?: boolean }) {
  return (
    <button type="button" onClick={() => dossierStore.set(to)} className={`btn ${solid ? "btn--solid" : ""}`}>
      {children}
      <span className="arrow" aria-hidden="true">↗</span>
    </button>
  );
}
