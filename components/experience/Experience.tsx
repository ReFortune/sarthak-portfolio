"use client";

import { useCallback, useEffect, useRef } from "react";
import { bootStore, cursorReadout, markBoot } from "@/lib/store";
import { beatStore, dossierStore, hoverStore } from "@/lib/world-store";
import { clamp, smoothstep } from "@/lib/math";
import { scrollToTarget } from "@/lib/scroll";
import { beatAt, beats, EXHIBIT_PROJECT, sectionRanges, TOTAL_SVH } from "@/components/world/story";
import type { World } from "@/components/world/world";
import { contents } from "./content";
import Labels from "./Labels";
import Rail from "./Rail";
import Dossier from "./Dossier";

declare global {
  interface Window {
    __world?: World;
  }
}

/**
 * The home page: one tall scroll, one fixed stage. The stage holds the WebGL world and, over it, the words of the
 * beat the story is in. The menu's ten sections are anchors laid along the scroll track, so the header, the HUD and
 * every `/#projects`-style link keep working.
 */
export default function Experience() {
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const beatEls = useRef<(HTMLDivElement | null)[]>([]);
  const worldRef = useRef<World | null>(null);
  const progress = useRef(0);
  const roverY = useRef<number | undefined>(undefined);

  /* the words fade in and out with the story; one beat at a time */
  const applyBeats = (u: number) => {
    const { index } = beatAt(u);
    beats.forEach((b) => {
      const el = beatEls.current[b.index];
      if (!el) return;
      const local = (u - b.u0) / (b.u1 - b.u0);
      const inside = u >= b.u0 && u <= b.u1;
      // the words are read while the camera holds; they are gone by the time it has moved far
      const f0 = b.hold >= 0.3 ? b.hold + (1 - b.hold) * 0.1 : 0.84;
      const f1 = b.hold >= 0.3 ? b.hold + (1 - b.hold) * 0.5 : 0.98;
      const rise = b.index === 0 ? 1 : smoothstep(0.02, 0.16, local);
      const fall = b.index === beats.length - 1 ? 1 : 1 - smoothstep(f0, f1, local);
      const o = inside ? rise * fall : 0;
      el.style.opacity = o.toFixed(3);
      el.style.transform = inside ? `translate3d(0, ${((0.5 - local) * 34).toFixed(1)}px, 0)` : "translate3d(0, 0, 0)";
      el.style.setProperty("--pe", o > 0.5 ? "auto" : "none");
    });
    if (beatStore.get() !== index) beatStore.set(index);
  };

  /* Tab into a beat that is not on screen: take the story to it, so what has focus is always visible */
  const focusBeat = (i: number) => {
    const t = track.current, s = stage.current;
    if (!t || !s) return;
    const b = beats[i];
    const centre = b.u0 + (b.u1 - b.u0) * 0.4;
    if (progress.current >= b.u0 + (b.u1 - b.u0) * 0.1 && progress.current <= b.u1 - (b.u1 - b.u0) * 0.1) return;
    const top = t.getBoundingClientRect().top + window.scrollY;
    scrollToTarget(top + centre * (t.offsetHeight - s.offsetHeight), { immediate: true, force: true });
  };

  const getLabels = useCallback(() => worldRef.current?.labels() ?? [], []);

  /* scroll → progress */
  useEffect(() => {
    const el = track.current, s = stage.current;
    if (!el || !s) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = el.offsetHeight - s.offsetHeight;
      const u = max > 0 ? clamp(-el.getBoundingClientRect().top / max, 0, 1) : 0;
      progress.current = u;
      worldRef.current?.setProgress(u);
      applyBeats(u);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* the world */
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let world: World | null = null;
    const cleanups: Array<() => void> = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const lowPower = coarse || window.innerWidth < 820 || (navigator.hardwareConcurrency ?? 8) <= 4;

    // A fresh canvas per mount keeps StrictMode remounts safe (a force-lost context can't be reused).
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "absolute inset-0 h-full w-full opacity-0 transition-opacity duration-700";
    el.appendChild(canvas);

    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      roverY.current = h && w / h < 0.85 ? 0.78 : undefined;
    };
    measure();

    (async () => {
      // no WebGL (or it is switched off): the story is still all there in words, over a quiet gradient
      try {
        const probe = document.createElement("canvas");
        const gl = (probe.getContext("webgl2") ?? probe.getContext("webgl")) as WebGLRenderingContext | null;
        if (!gl) throw new Error("no webgl");
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        markBoot("scene");
        return;
      }
      let mod: typeof import("@/components/world/world");
      try {
        mod = await import("@/components/world/world");
      } catch {
        markBoot("scene");
        return;
      }
      if (disposed) return;
      try {
        world = mod.createWorld(canvas, {
          reduced,
          lowPower,
          getRoverY: () => roverY.current,
          onReady: () => {
            canvas.style.opacity = "1";
            markBoot("scene");
          },
        });
      } catch (err) {
        // No WebGL: the gradient behind the canvas stays, and the story still reads.
        console.warn("The world is unavailable:", err);
        markBoot("scene");
        return;
      }
      worldRef.current = world;
      if (process.env.NODE_ENV !== "production") window.__world = world;
      world.setProgress(progress.current);

      const io = new IntersectionObserver((entries) => world?.setVisible(entries[entries.length - 1].isIntersecting), { rootMargin: "80px" });
      io.observe(el);
      const ro = new ResizeObserver(() => {
        measure();
        world?.resize();
      });
      ro.observe(el);
      cleanups.push(() => {
        io.disconnect();
        ro.disconnect();
      });

      // uncover the world when the preloader lifts
      const lift = () => {
        if (bootStore.get().done) world?.intro();
      };
      lift();
      cleanups.push(bootStore.subscribe(lift));

      /* the pointer: it paints the ground, ranges it, finds the instruments and opens them */
      let lastReadout = 0;
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        const over = e.target as HTMLElement | null;
        const blocked = !!over?.closest("a, button, [data-no-ping], [role='dialog']");
        if (!inside || blocked || dossierStore.get()) {
          world?.setPointer(0, 0, false);
          if (cursorReadout.get()) cursorReadout.set("");
          return;
        }
        world?.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), true);
        const now = performance.now();
        if (now - lastReadout > 90 && e.pointerType === "mouse") {
          lastReadout = now;
          const rd = world?.readout();
          cursorReadout.set(rd ? `RNG ${rd.range.toFixed(2)} m · EL ${rd.elev >= 0 ? "+" : "−"}${Math.abs(rd.elev).toFixed(2)}` : "NO RETURN");
        }
      };
      const onDown = (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest("a, button, [data-no-ping], [role='dialog']")) return;
        if (!reduced && !hoverStore.get()) world?.press();
      };
      // a click (or a tap: a swipe is not one) on an instrument opens its dossier
      const onClick = (e: MouseEvent) => {
        if (!world || dossierStore.get() || (e.target as HTMLElement).closest("a, button, [data-no-ping], [role='dialog']")) return;
        const r = el.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
        world.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), true);
        const h = world.hovered();
        if (h && EXHIBIT_PROJECT[h]) dossierStore.set({ kind: "project", id: EXHIBIT_PROJECT[h] });
        else if (e.detail === 0 || (e as PointerEvent).pointerType === "touch") world.setPointer(0, 0, false);
      };
      const onLeave = () => {
        world?.setPointer(0, 0, false);
        cursorReadout.set("");
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      window.addEventListener("click", onClick);
      document.documentElement.addEventListener("pointerleave", onLeave);
      window.addEventListener("blur", onLeave);
      // which instrument is under the pointer
      let hraf = 0;
      const poll = () => {
        hraf = requestAnimationFrame(poll);
        const h = dossierStore.get() ? null : world?.hovered() ?? null;
        if (hoverStore.get() !== h) hoverStore.set(h);
      };
      hraf = requestAnimationFrame(poll);
      cleanups.push(() => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerdown", onDown);
        window.removeEventListener("click", onClick);
        document.documentElement.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("blur", onLeave);
        cancelAnimationFrame(hraf);
        hoverStore.set(null);
        cursorReadout.set("");
      });
    })();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      world?.dispose();
      worldRef.current = null;
      if (window.__world === world) delete window.__world;
      canvas.remove();
    };
  }, []);

  return (
    <main id="main">
      <div ref={track} data-track className="relative" style={{ height: `${TOTAL_SVH}svh` }}>
        {/* where each menu section begins, and how long it lasts (the HUD and every in-page link read these) */}
        {sectionRanges.map((r) => (
          <div key={r.id} id={r.id} data-section={r.id} className="pointer-events-none absolute inset-x-0" style={{ top: `${r.start}svh`, height: `${r.length}svh` }} />
        ))}

        <div ref={stage} data-stage className="sticky top-0 h-[100svh] overflow-hidden bg-ink" data-cursor="scan">
          {/* the fallback if WebGL is unavailable (the world's canvas is opaque) */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(90%_60%_at_60%_78%,rgb(var(--ice)/0.16),transparent_62%),radial-gradient(60%_40%_at_70%_82%,rgb(var(--laser)/0.12),transparent_70%)]"
          />
          <div ref={host} className="absolute inset-0" />

          {/* legibility: light, so the world stays luminous */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink/80 to-transparent" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_72%_at_10%_46%,rgb(var(--ink)/0.62)_0%,rgb(var(--ink)/0.3)_48%,transparent_80%)]" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink/80 to-transparent" />

          <Labels source={getLabels} />

          {/* the words */}
          {beats.map((b) => {
            const node = contents[b.id];
            if (!node) return null;
            return (
              <div
                key={b.id}
                ref={(el) => {
                  beatEls.current[b.index] = el;
                }}
                data-beat={b.id}
                onFocusCapture={() => focusBeat(b.index)}
                className={`pointer-events-none absolute inset-0 z-[3] will-change-[opacity,transform] ${b.index === 0 ? "" : "opacity-0"}`}
                style={{ "--pe": b.index === 0 ? "auto" : "none" } as React.CSSProperties}
              >
                {node}
              </div>
            );
          })}
        </div>
      </div>
      <Rail />
      <Dossier />
    </main>
  );
}
