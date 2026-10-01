import type { ReactNode } from "react";
import Reveal from "./Reveal";
import SplitReveal from "./SplitReveal";

/** Standard section opener: hairline + index, big expanded title, optional lede. */
export default function SectionHead({
  n,
  label,
  title,
  lede,
  className = "",
  size = "md",
}: {
  n: string;
  label: string;
  title: ReactNode;
  lede?: ReactNode;
  className?: string;
  size?: "md" | "lg";
}) {
  return (
    <header className={`mb-14 md:mb-20 ${className}`}>
      <Reveal className="flex items-center justify-between border-t border-bone/15 pt-4">
        <p className="label label-strong flex items-center gap-3">
          <span className="text-laser tnum">{n}</span>
          <span aria-hidden="true">—</span>
          {label}
        </p>
        <p className="label hidden sm:block">Sarthak Sahai · 2026</p>
      </Reveal>
      <SplitReveal
        as="h2"
        className={`h-display mt-10 md:mt-14 ${size === "lg" ? "text-d-lg" : "text-d-md"}`}
      >
        {title}
      </SplitReveal>
      {lede && (
        <Reveal className="lede mt-8 max-w-2xl" delay={0.15}>
          {lede}
        </Reveal>
      )}
    </header>
  );
}
