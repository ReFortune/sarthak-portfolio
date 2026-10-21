import { panelStore, sheetStore } from "@/lib/world-store";

let opener: HTMLElement | null = null;

/** Open the instrument large (a sheet on a narrow screen), remembering what had focus so closing can give it back. */
export function openSheet() {
  if (!panelStore.get()) return;
  opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  sheetStore.set(true);
}

/** Close it, and give focus back: to what opened it, or, if that was replaced by closing, to the control that took its place. */
export function closeSheet() {
  sheetStore.set(false);
  const was = opener;
  opener = null;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const target = was && was.isConnected ? was : document.querySelector<HTMLElement>("[data-sheet-opener]");
      target?.focus({ preventScroll: true });
    })
  );
}
