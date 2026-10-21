"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { startScroll, stopScroll } from "@/lib/scroll";
import { useStore } from "@/lib/store";
import { dockStore, foldStore, panelEnv, panelStore, sheetStore } from "@/lib/world-store";
import PointerText from "@/components/ui/PointerText";
import type { PanelId } from "@/components/world/story";
import { instruments, type Instrument } from "./instruments";

/* ─────────────────────────────────────────────────────────────────────────
   THE PANEL — where the story's live instruments sit. On a wide screen it is docked at the right of the world and
   comes and goes with the stop it belongs to (the world makes room for it); on a narrow one a bar at the foot of the
   screen opens it as a sheet. The words of the stop stay where they are, so the picture, the words and the instrument
   are all there at once.
   ───────────────────────────────────────────────────────────────────────── */

/** How wide the docked panel is (the world makes room for exactly this much: see `Experience`). */
export const PANEL_WIDTH = "clamp(26rem, 38vw, 42rem)";

const Loading = () => (
  <div className="grid h-full min-h-40 w-full place-items-center">
    <p className="label">Loading instrument…</p>
  </div>
);

/** Follows how fully the panel is on show: written by the story as it scrolls, straight to the element. */
function useEnv(ref: React.RefObject<HTMLElement | null>, slide: number) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const apply = () => {
      const e = panelEnv.get();
      el.style.opacity = e.toFixed(3);
      el.style.transform = slide && !still ? `translate3d(${((1 - e) * slide).toFixed(1)}px, 0, 0)` : "";
      el.style.visibility = e > 0.01 ? "visible" : "hidden";
      el.style.pointerEvents = e > 0.6 ? "auto" : "none";
    };
    apply();
    return panelEnv.subscribe(apply);
  }, [ref, slide]);
}

/** What the instrument is, the instrument itself, and what to look at in it. */
function Frame({ ins, onFold, foldLabel, onExpand }: { ins: Instrument; onFold?: () => void; foldLabel?: string; onExpand?: () => void }) {
  const Body = ins.Body;
  const body = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);

  // a body that overflows scrolls on its own; one that does not leaves the wheel to the story
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => setScrolls(el.scrollHeight > el.clientHeight + 2);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [ins.id]);

  const fill = ins.size !== "auto";
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-bone/12 px-4 py-2.5">
        <p className="label label-strong min-w-0 truncate">
          <span className="text-laser">{ins.fig}</span> <span aria-hidden="true">—</span> {ins.title}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          {ins.code && <span className="label hidden min-[1400px]:inline">{ins.code}</span>}
          {onExpand && (
            <button type="button" onClick={onExpand} aria-label="Open the instrument larger" title="Open larger" data-cursor="link" className="grid h-7 w-7 place-items-center border border-bone/25 transition-colors hover:border-bone hover:bg-bone hover:text-ink">
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                <path d="M7 1h4v4M5 11H1V7M11 1 7 5M1 11l4-4" />
              </svg>
            </button>
          )}
          {onFold && (
            <button type="button" onClick={onFold} aria-label={foldLabel} title={foldLabel} data-cursor="link" className="grid h-7 w-7 place-items-center border border-bone/25 font-mono text-xs transition-colors hover:border-bone hover:bg-bone hover:text-ink">
              <span aria-hidden="true">{onExpand ? "›" : "✕"}</span>
            </button>
          )}
        </div>
      </div>

      <div ref={body} data-panel-body {...(scrolls ? { "data-lenis-prevent": "" } : {})} className="dossier-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="relative" style={fill ? ({ height: "100%", minHeight: `${(ins.size as { fill: number }).fill}rem` } as CSSProperties) : undefined}>
          <Suspense fallback={<Loading />}>
            <Body />
          </Suspense>
        </div>
      </div>

      <div className="shrink-0 border-t border-bone/12 px-4 py-2.5">
        <p className="text-[0.78rem] leading-[1.42] text-bone-dim">
          <span className="label label-strong mr-2">What you’re looking at</span>
          {ins.what}
        </p>
        <p className="label mt-1.5 !normal-case !tracking-[0.02em]">
          <span className="mr-2 text-laser">Try</span>
          <PointerText fine={ins.hint.fine} coarse={ins.hint.coarse} />
        </p>
      </div>
    </>
  );
}

/** Wide screens: docked at the right of the world. */
function Dock({ ins }: { ins: Instrument }) {
  const root = useRef<HTMLElement>(null);
  useEnv(root, 26);

  if (ins.bare) {
    return (
      <aside ref={root} aria-label={ins.title} data-no-ping className="absolute right-14 top-[6.25rem] z-[4] [@media(max-height:760px)]:top-[5.25rem]" style={{ width: ins.width, visibility: "hidden", opacity: 0 }}>
        <Suspense fallback={null}>
          <ins.Body />
        </Suspense>
      </aside>
    );
  }
  const fill = ins.size !== "auto";
  return (
    <aside
      ref={root}
      aria-label={`Instrument: ${ins.title}`}
      data-no-ping
      data-cursor="default"
      className={`window ticks absolute right-14 top-[6.25rem] z-[4] flex flex-col bg-ink-2/90 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.85)] backdrop-blur-md [@media(max-height:760px)]:top-[5.25rem] ${fill ? "bottom-[4.75rem]" : "max-h-[calc(100%-11rem)]"}`}
      style={{ width: ins.width ?? PANEL_WIDTH, visibility: "hidden", opacity: 0 }}
    >
      <Frame ins={ins} onFold={() => foldStore.set(true)} foldLabel="Fold the panel away" onExpand={() => sheetStore.set(true)} />
    </aside>
  );
}

/** Folded away: a tab to bring it back. */
function Tab({ ins }: { ins: Instrument }) {
  const root = useRef<HTMLButtonElement>(null);
  useEnv(root, 0);
  return (
    <button
      ref={root}
      type="button"
      onClick={() => foldStore.set(false)}
      data-no-ping
      data-cursor="link"
      aria-label={`Show the instrument: ${ins.title}`}
      className="label absolute right-14 top-[6.25rem] z-[4] flex items-center gap-3 border border-bone/30 bg-ink/85 px-3.5 py-2.5 !text-bone backdrop-blur-md transition-colors hover:border-bone [@media(max-height:760px)]:top-[5.25rem]"
      style={{ visibility: "hidden", opacity: 0 }}
    >
      <span className="text-laser">{ins.fig}</span>
      <span aria-hidden="true">‹</span>
    </button>
  );
}

/** Narrow screens: a bar at the foot of the screen. */
function Bar({ ins }: { ins: Instrument }) {
  const root = useRef<HTMLDivElement>(null);
  useEnv(root, 0);
  return (
    <div ref={root} className="absolute inset-x-3 bottom-3 z-[4] md:bottom-[5.25rem] md:left-1/2 md:right-auto md:w-[min(34rem,calc(100%-2*var(--gutter)))] md:-translate-x-1/2" style={{ visibility: "hidden", opacity: 0 }} data-no-ping>
      <button
        type="button"
        onClick={() => sheetStore.set(true)}
        data-cursor="link"
        className="flex w-full items-center justify-between gap-3 rounded-full border border-bone/30 bg-ink/90 px-5 py-3 text-left backdrop-blur-md transition-colors active:border-laser"
      >
        <span className="label label-strong min-w-0 truncate">
          <span className="text-laser">{ins.fig}</span> <span aria-hidden="true">—</span> {ins.title}
        </span>
        <span className="label shrink-0 !text-bone">
          Try it <span aria-hidden="true">↑</span>
        </span>
      </button>
    </div>
  );
}

/** Narrow screens: the instrument, over the world. */
function Sheet({ ins, wide }: { ins: Instrument; wide: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => sheetStore.set(false), []);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    stopScroll();
    const id = requestAnimationFrame(() => {
      setOn(true);
      panel.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab" || !panel.current) return;
      const f = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, [tabindex='0']")];
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1], cur = document.activeElement;
      if (e.shiftKey && (cur === a || !f.includes(cur as HTMLElement))) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && (cur === z || !f.includes(cur as HTMLElement))) { e.preventDefault(); a.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
      startScroll();
      opener?.focus({ preventScroll: true });
    };
  }, [close]);

  return (
    <div className="fixed inset-0 z-[75]" role="presentation">
      <div aria-hidden="true" onClick={close} className={`absolute inset-0 bg-ink/70 backdrop-blur-[3px] transition-opacity duration-300 motion-reduce:transition-none ${on ? "opacity-100" : "opacity-0"}`} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Instrument: ${ins.title}`}
        data-no-ping
        data-cursor="default"
        className={`absolute flex flex-col border border-bone/15 bg-ink-2 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none ${
          wide
            ? `inset-x-0 top-[5svh] mx-auto h-[90svh] w-[min(68rem,94vw)] rounded-[14px] shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9)] ${on ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"}`
            : `inset-x-0 bottom-0 h-[min(90svh,52rem)] rounded-t-[1.25rem] border-b-0 shadow-[0_-30px_80px_-20px_rgb(0_0_0/0.8)] ${on ? "translate-y-0" : "translate-y-full"}`
        }`}
      >
        <Frame ins={ins} onFold={close} foldLabel="Close the instrument" />
      </div>
    </div>
  );
}

/** The instrument for the stop the story is at: docked beside the world, or offered at the foot of a narrow screen. */
export default function Panel() {
  const id = useStore(panelStore) as PanelId | null;
  const dock = useStore(dockStore);
  const folded = useStore(foldStore);
  const sheet = useStore(sheetStore);
  const ins = id ? instruments[id] : null;

  // a sheet belongs to the stop it was opened at
  useEffect(() => {
    if (!ins || ins.bare) sheetStore.set(false);
  }, [ins]);

  if (!ins) return null;
  if (ins.bare) return dock ? <Dock ins={ins} /> : null;
  if (sheet) return <Sheet ins={ins} wide={dock} />;
  if (dock) return folded ? <Tab ins={ins} /> : <Dock ins={ins} />;
  return <Bar ins={ins} />;
}
