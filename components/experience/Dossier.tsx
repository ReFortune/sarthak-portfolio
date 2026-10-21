"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { startScroll, stopScroll } from "@/lib/scroll";
import { useStore } from "@/lib/store";
import { dossierStore, type DossierRef } from "@/lib/world-store";
import { Record, RECORD_KIND } from "./records";

/**
 * The dossier: the place where the story's depth lives. The scroll is the experience; this is what you open when a
 * moment in it makes you want the detail. One record at a time, in a drawer over the world.
 */
export default function Dossier() {
  const want = useStore(dossierStore);
  const pathname = usePathname();
  const [rec, setRec] = useState<DossierRef | null>(null);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const reduced = useRef(false);

  const close = useCallback(() => dossierStore.set(null), []);

  /* open and close, keeping the record on screen while the drawer slides away */
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (want) {
      if (!open) opener.current = document.activeElement as HTMLElement | null;
      setRec(want);
      stopScroll();
      const id = requestAnimationFrame(() => {
        setOpen(true);
        window.setTimeout(() => closeBtn.current?.focus({ preventScroll: true }), reduced.current ? 0 : 350);
      });
      return () => cancelAnimationFrame(id);
    }
    if (!open) return;
    setOpen(false);
    startScroll();
    opener.current?.focus({ preventScroll: true });
    const t = window.setTimeout(() => setRec(null), reduced.current ? 0 : 520);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  // a new record while one is open: back to its top
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>("[data-scroll]")?.scrollTo({ top: 0 });
  }, [want?.kind, want?.id, open]);

  // navigating away closes it, and a drawer that is torn down while open must not leave the page locked
  useEffect(() => {
    dossierStore.set(null);
  }, [pathname]);
  useEffect(
    () => () => {
      if (dossierStore.get()) startScroll();
      dossierStore.set(null);
    },
    []
  );

  /* Esc closes; Tab stays inside the drawer */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab" || !panel.current) return;
      const f = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex='0']")];
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1], cur = document.activeElement;
      if (e.shiftKey && (cur === a || !f.includes(cur as HTMLElement))) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && (cur === z || !f.includes(cur as HTMLElement))) { e.preventDefault(); a.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!rec) return null;
  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div
        aria-hidden="true"
        onClick={close}
        className={`absolute inset-0 bg-ink/70 backdrop-blur-[3px] transition-opacity duration-500 motion-reduce:transition-none ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dossier-title"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[38rem] flex-col border-l border-bone/12 bg-ink-2 shadow-[-40px_0_80px_-30px_rgb(0_0_0/0.8)] transition-transform duration-500 ease-out motion-reduce:transition-none ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-bone/12 px-[clamp(1.25rem,3vw,2rem)] py-4">
          <p className="label label-strong">Dossier · {RECORD_KIND[rec.kind]}</p>
          <button ref={closeBtn} type="button" onClick={close} className="label group -mr-2 flex min-h-11 items-center gap-3 px-2 !text-bone" data-cursor="link">
            Close
            <span aria-hidden="true" className="relative block h-2.5 w-5">
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rotate-45 bg-bone" />
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 -rotate-45 bg-bone" />
            </span>
          </button>
        </div>
        <div data-scroll data-lenis-prevent className="dossier-scroll min-h-0 flex-1 overflow-y-auto px-[clamp(1.25rem,3vw,2rem)] pb-16 pt-8">
          <Record r={rec} />
        </div>
      </div>
    </div>
  );
}
