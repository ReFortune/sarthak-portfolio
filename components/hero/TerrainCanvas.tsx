"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { bootStore, cursorReadout, markBoot, planReadout } from "@/lib/store";
import type { TerrainScene } from "./terrainScene";

type Props = {
  /** 0 → 1 as the hero scrolls out of view. Written by the parent, read each frame. */
  scrollRef?: MutableRefObject<number>;
  className?: string;
  /** Hold the intro until true (the preloader lifting). */
  introReady?: boolean;
  onPoints?: (n: number) => void;
};

declare global {
  interface Window {
    __terrain?: TerrainScene;
  }
}

export default function TerrainCanvas({ scrollRef, className, introReady = true, onPoints }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TerrainScene | null>(null);
  const introRef = useRef(introReady);
  introRef.current = introReady;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let scene: TerrainScene | null = null;
    const cleanups: Array<() => void> = [];

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const lowPower = coarse || window.innerWidth < 820 || (navigator.hardwareConcurrency ?? 8) <= 4;

    // A fresh canvas per mount keeps StrictMode remounts safe (a force-lost context can't be reused).
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "absolute inset-0 h-full w-full";
    el.appendChild(canvas);

    (async () => {
      let mod: typeof import("./terrainScene");
      try {
        mod = await import("./terrainScene");
      } catch {
        markBoot("scene");
        return;
      }
      if (disposed) return;
      try {
        scene = mod.createTerrainScene(canvas, {
          reduced,
          lowPower,
          onPlan: (p) => planReadout.set(p),
          onReady: () => {
            markBoot("scene");
            canvas.style.opacity = "1";
            if (introRef.current && !reduced) scene?.intro();
          },
        });
      } catch (err) {
        // No WebGL: leave the CSS fallback behind the canvas visible.
        console.warn("Terrain scene unavailable:", err);
        markBoot("scene");
        return;
      }
      sceneRef.current = scene;
      onPoints?.(scene.getPointCount());
      if (process.env.NODE_ENV !== "production") window.__terrain = scene;

      /* visibility → pause the render loop off-screen */
      const io = new IntersectionObserver(([e]) => scene?.setVisible(e.isIntersecting), { rootMargin: "80px" });
      io.observe(el);
      cleanups.push(() => io.disconnect());

      /* resize */
      const ro = new ResizeObserver(() => scene?.resize());
      ro.observe(el);
      cleanups.push(() => ro.disconnect());

      if (reduced) return;

      /* pointer → NDC within the hero's rect (listening on window so overlaid text never blocks painting) */
      let lastReadout = 0;
      const onMove = (e: PointerEvent) => {
        if (!scene) return;
        const r = el.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) {
          scene.setPointer(0, 0, false);
          if (cursorReadout.get()) cursorReadout.set("");
          return;
        }
        const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
        const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
        scene.setPointer(nx, ny, true);
        const now = performance.now();
        if (now - lastReadout > 90 && e.pointerType === "mouse") {
          lastReadout = now;
          const ro = scene.getReadout();
          cursorReadout.set(
            ro ? `RNG ${ro.range.toFixed(2)} m · EL ${ro.elev >= 0 ? "+" : "−"}${Math.abs(ro.elev).toFixed(2)}` : "NO RETURN"
          );
        }
      };
      const onLeave = () => {
        scene?.setPointer(0, 0, false);
        cursorReadout.set("");
      };
      const onDown = (e: PointerEvent) => {
        if (!scene) return;
        const r = el.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
        const t = e.target as HTMLElement;
        if (t.closest("a, button, [data-no-ping]")) return;
        scene.ping();
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      window.addEventListener("blur", onLeave);
      cleanups.push(() => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerdown", onDown);
        document.documentElement.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("blur", onLeave);
        cursorReadout.set("");
      });

      /* scroll progress, pushed from the parent via the ref */
      let raf = 0;
      const pump = () => {
        raf = requestAnimationFrame(pump);
        if (scrollRef) scene?.setScroll(scrollRef.current);
      };
      raf = requestAnimationFrame(pump);
      cleanups.push(() => cancelAnimationFrame(raf));
    })();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      scene?.dispose();
      sceneRef.current = null;
      planReadout.set(null);
      if (window.__terrain === scene) delete window.__terrain;
      canvas.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kick the intro when the preloader finishes (may happen before or after the scene is ready).
  useEffect(() => {
    if (introReady) sceneRef.current?.intro();
  }, [introReady]);

  // Also react to the boot store directly in case introReady wasn't threaded through.
  useEffect(
    () =>
      bootStore.subscribe(() => {
        if (bootStore.get().done) sceneRef.current?.intro();
      }),
    []
  );

  return (
    <div
      ref={host}
      className={className}
      style={{ touchAction: "pan-y" }}
      data-cursor="scan"
    />
  );
}
