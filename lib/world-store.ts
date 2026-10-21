"use client";

import { createStore } from "./store";
import type { Telemetry } from "@/components/world/world";

/** What the dossier drawer is showing: a kind of record and which one (null = closed). */
export type DossierRef = { kind: "about" | "experience" | "project" | "leadership" | "research" | "skills" | "timeline"; id?: string };
export const dossierStore = createStore<DossierRef | null>(null);

/** The ring exhibit the pointer is over (null = none). */
export const hoverStore = createStore<string | null>(null);

/** Which beat the story is in (index into `beats`), for the rail and the HUD. */
export const beatStore = createStore<number>(0);

/* ── the instrument panel ─────────────────────────────────────────────────── */

/** Which instrument owns the panel at this point of the story (a `PanelId`, or null between them). */
export const panelStore = createStore<string | null>(null);

/** How fully the panel is on show (0–1). Written every scroll tick, so it is read with `subscribe`, never as React state. */
export const panelEnv = createStore<number>(0);

/** The wide layout is in use: the panel is docked beside the world. */
export const dockStore = createStore<boolean>(false);

/** The visitor has folded the docked panel away. */
export const foldStore = createStore<boolean>(false);

/** On a narrow screen the panel opens as a sheet over the world. */
export const sheetStore = createStore<boolean>(false);

/** What the DOM is pointing at in the world (a skills group, a timeline row): the world lights it up. */
export const focusStore = createStore<string | null>(null);

/** A way to ask the running world what the rover knows. The home page fills it in once the world exists. */
export const worldApi: { telemetry(): Telemetry | null } = { telemetry: () => null };
