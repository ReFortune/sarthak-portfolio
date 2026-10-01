"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";
import { gsap } from "./gsap";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Scoped GSAP context with automatic cleanup. `motion` is false when the user
 * prefers reduced motion — callers should still leave content in its final state.
 */
export function useGsap(
  scope: RefObject<HTMLElement | null>,
  build: (ctx: { motion: boolean }) => void | (() => void),
  deps: unknown[] = []
) {
  useIsoLayoutEffect(() => {
    if (!scope.current) return;
    const motion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cleanup: void | (() => void);
    const ctx = gsap.context(() => {
      cleanup = build({ motion });
    }, scope);
    return () => {
      if (typeof cleanup === "function") cleanup();
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
