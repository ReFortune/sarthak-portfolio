"use client";

import type Lenis from "lenis";

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

export const getLenis = () => (typeof window === "undefined" ? undefined : window.__lenis);

type Target = string | number | HTMLElement;

/** Move keyboard focus to a scroll target (in-page links should not leave focus behind at the link). Decorative markers hand focus to the next element. */
export function focusTarget(el: HTMLElement | null) {
  if (!el) return;
  const target = el.getAttribute("aria-hidden") === "true" ? ((el.nextElementSibling as HTMLElement | null) ?? el) : el;
  if (!target.matches("a[href], button, input, select, textarea, [tabindex]")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

/** Smooth-scroll to an element / selector / y offset (falls back to native when Lenis is off). */
export function scrollToTarget(target: Target, opts: { offset?: number; duration?: number; immediate?: boolean; force?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const { offset = 0, duration = 1.6, immediate = false, force = false } = opts;
  const lenis = getLenis();
  if (lenis) {
    lenis.scrollTo(target as never, {
      offset,
      duration,
      immediate,
      force,
      easing: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
      onComplete: () => {
        const el = typeof target === "string" ? document.querySelector<HTMLElement>(target) : typeof target === "number" ? null : target;
        focusTarget(el);
      },
    });
    return;
  }
  if (typeof target === "number") {
    window.scrollTo({ top: target + offset, behavior: immediate ? "auto" : "smooth" });
    return;
  }
  const el = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset, behavior: immediate ? "auto" : "smooth" });
}

export const stopScroll = () => {
  getLenis()?.stop();
  document.documentElement.classList.add("scroll-locked");
};
export const startScroll = () => {
  getLenis()?.start();
  document.documentElement.classList.remove("scroll-locked");
};
