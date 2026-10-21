"use client";

import { useStore } from "@/lib/store";
import { dockStore, sheetStore } from "@/lib/world-store";

/** True when the instrument has been opened large on a wide screen: room enough for the layout the long-form page gives it. */
export function useLarge() {
  const large = useStore(sheetStore);
  const dock = useStore(dockStore);
  return large && dock;
}
