"use client";

import { useRef } from "react";
import { gsap } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";

type Props = {
  to: number;
  from?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
  /** Use thousands separators. */
  group?: boolean;
};

const fmt = (v: number, decimals: number, group: boolean) =>
  v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: group });

/** Number that counts up when it scrolls into view. SSR renders the final value (no layout shift, no-JS safe). */
export default function CountUp({ to, from = 0, decimals = 0, prefix = "", suffix = "", duration = 2, className, group = true }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useGsap(ref, ({ motion }) => {
    const el = ref.current!;
    if (!motion) return;
    const o = { v: from };
    const write = () => (el.textContent = `${prefix}${fmt(o.v, decimals, group)}${suffix}`);
    write();
    gsap.to(o, {
      v: to,
      duration,
      ease: "power3.out",
      onUpdate: write,
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  }, [to, from]);

  return (
    <span ref={ref} className={`tnum ${className ?? ""}`}>
      {prefix}
      {fmt(to, decimals, group)}
      {suffix}
    </span>
  );
}
