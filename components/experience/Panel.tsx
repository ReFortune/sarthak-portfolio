"use client";

import { Component, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { startScroll, stopScroll } from "@/lib/scroll";
import { useStore } from "@/lib/store";
import { dockStore, foldStore, panelEnv, panelStore, sheetStore } from "@/lib/world-store";
import PointerText from "@/components/ui/PointerText";
import type { PanelId } from "@/components/world/story";
import { bodyOf, instruments, resetBody, type Instrument } from "./instruments";
import { PANEL, PANEL_WIDTH } from "./panelGeometry";
import { closeSheet, openSheet } from "./sheet";

/* ─────────────────────────────────────────────────────────────────────────
   THE PANEL — where the story's live instruments sit. On a wide screen it is docked at the right of the world and
   comes and goes with the stop it belongs to (the world makes room for it); it can be folded away, or opened large in
   place (the same instrument, so nothing is lost). On a narrow one a bar at the foot of the screen opens it as a sheet.
   The words of the stop stay where they are, so the picture, the words and the instrument are all there at once.
   ───────────────────────────────────────────────────────────────────────── */

const Loading = () => (
  <div className="grid h-full min-h-40 w-full place-items-center">
    <p className="label">Loading instrument…</p>
  </div>
);

/** If an instrument's code cannot be fetched (a dropped connection, a new deploy), say so here and carry on: the rest of the page is untouched. */
class Boundary extends Component<{ id: PanelId; children: ReactNode }, { failed: boolean; retried: boolean }> {
  state = { failed: false, retried: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("An instrument could not be loaded:", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const again = this.state.retried;
    return (
      <div className="grid min-h-40 place-items-center gap-3 p-6 text-center">
        <p className="label">This instrument could not be loaded.</p>
        <button
          type="button"
          className="label link !text-bone"
          onClick={() => {
            // (some loaders remember a failure: if a second try fails too, the way out is a fresh page)
            if (again) return window.location.reload();
            resetBody(this.props.id);
            this.setState({ failed: false, retried: true });
          }}
        >
          {again ? "Reload the page" : "Try again"}
        </button>
      </div>
    );
  }
}

/** The instrument itself, loaded when wanted. */
function Body({ id }: { id: PanelId }) {
  const B = bodyOf(id);
  return (
    <Boundary id={id}>
      <Suspense fallback={<Loading />}>
        <B />
      </Suspense>
    </Boundary>
  );
}

/** Follows how fully the panel is on show: written by the story as it scrolls, straight to the element. `pinned` holds it fully on show. */
function useEnv(ref: React.RefObject<HTMLElement | null>, slide: number, pinned = false) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const apply = () => {
      const e = pinned ? 1 : panelEnv.get();
      el.style.opacity = e.toFixed(3);
      el.style.transform = slide && !still && !pinned ? `translate3d(${((1 - e) * slide).toFixed(1)}px, 0, 0)` : "";
      el.style.visibility = e > 0.01 ? "visible" : "hidden";
      el.style.pointerEvents = e > 0.6 ? "auto" : "none";
    };
    apply();
    return panelEnv.subscribe(apply);
  }, [ref, slide, pinned]);
}

/** While something modal is open over the story: the page holds still, Esc closes it, Tab stays inside it. */
function useModal(root: React.RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    if (!on) return;
    stopScroll();
    const id = requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("[data-close]")?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeSheet();
      if (e.key !== "Tab" || !root.current) return;
      const f = [...root.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, [tabindex='0']")];
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
    };
  }, [on, root]);
}

/** What the instrument is, the instrument itself, and what to look at in it. */
function Frame({ ins, mode }: { ins: Instrument; mode: "dock" | "large" }) {
  const body = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  const wide = useStore(dockStore);

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
  const btn = "grid h-7 w-7 place-items-center border border-solid border-bone/25 font-mono text-xs transition-colors hover:border-bone hover:bg-bone hover:text-ink";
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-bone/12 px-4 py-2.5">
        <p className="label label-strong min-w-0 truncate">
          <span className="text-laser">{ins.fig}</span> <span aria-hidden="true">—</span> {ins.title}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          {ins.code && <span className="label hidden min-[1400px]:inline">{ins.code}</span>}
          {mode === "dock" ? (
            <>
              <button type="button" onClick={openSheet} data-sheet-opener aria-label="Open the instrument larger" title="Open larger" data-cursor="link" className={btn}>
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                  <path d="M7 1h4v4M5 11H1V7M11 1 7 5M1 11l4-4" />
                </svg>
              </button>
              <button type="button" onClick={() => foldStore.set(true)} aria-label="Fold the panel away" title="Fold away" data-cursor="link" className={btn}>
                <span aria-hidden="true">›</span>
              </button>
            </>
          ) : (
            <button type="button" onClick={closeSheet} data-close aria-label="Close the instrument" title="Close" data-cursor="link" className={btn}>
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>
      </div>

      <div ref={body} data-panel-body {...(scrolls ? { "data-lenis-prevent": "" } : {})} className="dossier-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="relative" style={fill ? ({ height: "100%", minHeight: mode === "large" && wide ? 0 : `${(ins.size as { fill: number }).fill}rem` } as CSSProperties) : undefined}>
          <Body id={ins.id} />
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

/** Wide screens: docked at the right of the world; opened large, the same panel simply takes the middle of the screen. */
function Dock({ ins }: { ins: Instrument }) {
  const root = useRef<HTMLElement>(null);
  const large = useStore(sheetStore);
  useEnv(root, 26, large);
  useModal(root, large);

  if (ins.bare) {
    return (
      <aside ref={root} aria-label={ins.title} data-no-ping className="absolute top-[6.25rem] z-[4] [@media(max-height:760px)]:top-[5.25rem]" style={{ right: `${PANEL.rightRem}rem`, width: ins.width, visibility: "hidden", opacity: 0 }}>
        <Body id={ins.id} />
      </aside>
    );
  }
  const fill = ins.size !== "auto";
  return (
    <>
      {large && <div aria-hidden="true" data-no-ping data-cursor="default" onClick={closeSheet} className="absolute inset-0 z-[5] bg-ink/70 backdrop-blur-[3px]" />}
      <aside
        ref={root}
        aria-label={`Instrument: ${ins.title}`}
        {...(large ? { role: "dialog", "aria-modal": true } : {})}
        data-no-ping
        data-cursor="default"
        className={`window ticks absolute flex flex-col bg-ink-2/90 backdrop-blur-md ${
          large
            ? "inset-x-0 bottom-[5rem] top-[8rem] z-[6] mx-auto w-[min(68rem,92vw)] shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9)]"
            : `top-[6.25rem] z-[4] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.85)] [@media(max-height:760px)]:top-[5.25rem] ${fill ? "bottom-[4.75rem]" : "max-h-[calc(100%-11rem)]"}`
        }`}
        style={large ? undefined : { right: `${PANEL.rightRem}rem`, width: ins.width ?? PANEL_WIDTH, visibility: "hidden", opacity: 0 }}
      >
        <Frame ins={ins} mode={large ? "large" : "dock"} />
      </aside>
    </>
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
      className="label absolute top-[6.25rem] z-[4] flex items-center gap-3 border border-solid border-bone/30 bg-ink/85 px-3.5 py-2.5 !text-bone backdrop-blur-md transition-colors hover:border-bone [@media(max-height:760px)]:top-[5.25rem]"
      style={{ right: `${PANEL.rightRem}rem`, visibility: "hidden", opacity: 0 }}
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
        onClick={openSheet}
        data-sheet-opener
        data-cursor="link"
        className="flex w-full items-center justify-between gap-3 rounded-full border border-solid border-bone/30 bg-ink/90 px-5 py-3 text-left backdrop-blur-md transition-colors active:border-laser"
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

/** Narrow screens: the instrument, over the world. It is set outside the stage so that none of the page's own chrome is drawn over it. */
function Sheet({ ins }: { ins: Instrument }) {
  const panel = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useModal(panel, true);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="presentation" data-no-ping>
      <div aria-hidden="true" data-cursor="default" onClick={closeSheet} className={`absolute inset-0 bg-ink/70 backdrop-blur-[3px] transition-opacity duration-300 motion-reduce:transition-none ${on ? "opacity-100" : "opacity-0"}`} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Instrument: ${ins.title}`}
        data-no-ping
        data-cursor="default"
        className={`absolute inset-x-0 bottom-0 flex h-[min(90svh,52rem)] flex-col rounded-t-[1.25rem] border border-b-0 border-solid border-bone/15 bg-ink-2 shadow-[0_-30px_80px_-20px_rgb(0_0_0/0.8)] transition-transform duration-300 ease-out motion-reduce:transition-none ${on ? "translate-y-0" : "translate-y-full"}`}
      >
        <Frame ins={ins} mode="large" />
      </div>
    </div>,
    document.body
  );
}

/** The instrument for the stop the story is at: docked beside the world, or offered at the foot of a narrow screen. */
export default function Panel() {
  const id = useStore(panelStore) as PanelId | null;
  const dock = useStore(dockStore);
  const folded = useStore(foldStore);
  const sheet = useStore(sheetStore);
  const ins = id ? instruments[id] : null;

  // a large view belongs to the stop it was opened at
  useEffect(() => {
    if (sheet && (!ins || ins.bare)) sheetStore.set(false);
  }, [ins, sheet]);

  if (!ins) return null;
  if (dock) return ins.bare ? <Dock ins={ins} /> : folded && !sheet ? <Tab ins={ins} /> : <Dock ins={ins} />;
  if (ins.bare) return null;
  return sheet ? <Sheet ins={ins} /> : <Bar ins={ins} />;
}
