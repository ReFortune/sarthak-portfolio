"use client";

import { createStore } from "./store";

/** What the dossier drawer is showing: a kind of record and which one (null = closed). */
export type DossierRef = { kind: "about" | "experience" | "project" | "leadership" | "research" | "skills" | "timeline"; id?: string };
export const dossierStore = createStore<DossierRef | null>(null);

/** The ring exhibit the pointer is over (null = none). */
export const hoverStore = createStore<string | null>(null);

/** Which beat the story is in (index into `beats`), for the rail and the HUD. */
export const beatStore = createStore<number>(0);
