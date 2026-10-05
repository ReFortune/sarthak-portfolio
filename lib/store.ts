"use client";

import { useSyncExternalStore } from "react";

/**
 * A minimal external store. Used for cross-component UI state that must not cause
 * React re-render storms (boot state, active section, cursor readouts).
 */
export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: T | ((prev: T) => T)) {
      const value = typeof next === "function" ? (next as (p: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStore<T>(store: ReturnType<typeof createStore<T>>, serverValue?: T): T {
  return useSyncExternalStore(store.subscribe, store.get, () => (serverValue !== undefined ? serverValue : store.get()));
}

/* ── Shared stores ─────────────────────────────────────────────────────── */

/** Boot sequence: the preloader waits on these flags before revealing the page. */
export const bootStore = createStore({
  fonts: false,
  scene: false,
  done: false, // preloader finished; hero intro may play
});

export const markBoot = (key: "fonts" | "scene" | "done") => bootStore.set((s) => (s[key] ? s : { ...s, [key]: true }));

/** Which home-page section currently owns the viewport (for the HUD + menu). */
export const sectionStore = createStore<{ id: string; index: number; progress: number }>({
  id: "top",
  index: 0,
  progress: 0,
});

/** Which chapter of a case study owns the viewport (for the header + HUD on /projects/*). `null` = above the first chapter. */
export const chapterStore = createStore<{ n: string; label: string; index: number; total: number } | null>(null);

/** Text the custom cursor shows while over an instrument (e.g. the hero terrain readout). */
export const cursorReadout = createStore<string>("");

/** What the hero's route planner reports each time it plans (null until the first plan). */
export type PlanReadout = {
  /** 3-D length of the drawn route (m). */
  length: number;
  /** Steepest step along it (degrees) and the limit the planner works to. */
  maxSlope: number;
  limit: number;
  /** Cells of steep ground in the stretch ahead. */
  blocked: number;
  /** Time spent planning (ms) and plans made so far. */
  ms: number;
  plans: number;
};
export const planReadout = createStore<PlanReadout | null>(null);

/** Menu overlay open state. */
export const menuStore = createStore<boolean>(false);
