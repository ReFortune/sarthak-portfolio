import type { Act, ActContext, ActFactory } from "./types";
import { createRing } from "./ring";
import { createSky } from "./sky";
import { createFinale } from "./finale";

/** The set pieces, in drawing order. */
const factories: ActFactory[] = [createRing, createSky, createFinale];

export function createActs(ctx: ActContext): Act[] {
  return factories.map((f) => f(ctx));
}

export type { Act, ActContext, ActFrame, Label, Project, Sortable } from "./types";
