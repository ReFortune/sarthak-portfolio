"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "@/lib/gsap";

/** Pulls its child toward the pointer when close. No-op on touch / reduced motion. */
export default function Magnetic({
  children,
  strength = 0.32,
  reach = 0.9,
  className = "",
}: {
  children: ReactNode;
  strength?: number;
  /** Activation distance as a multiple of the element's larger side. */
  reach?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const xTo = gsap.quickTo(el, "x", { duration: 0.7, ease: "elastic.out(1, 0.45)" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.7, ease: "elastic.out(1, 0.45)" });
    let rect = el.getBoundingClientRect();
    let raf = 0;

    const measure = () => {
      // measure the un-translated box so the target doesn't chase itself
      const x = gsap.getProperty(el, "x") as number;
      const y = gsap.getProperty(el, "y") as number;
      const r = el.getBoundingClientRect();
      rect = new DOMRect(r.left - x, r.top - y, r.width, r.height);
    };
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        measure();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const limit = Math.max(rect.width, rect.height) * (0.5 + reach);
        if (Math.hypot(dx, dy) < limit) {
          xTo(dx * strength);
          yTo(dy * strength);
        } else {
          xTo(0);
          yTo(0);
        }
      });
    };
    const leave = () => {
      xTo(0);
      yTo(0);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, [strength, reach]);

  return (
    <div ref={ref} className={`inline-block will-change-transform ${className}`}>
      {children}
    </div>
  );
}
