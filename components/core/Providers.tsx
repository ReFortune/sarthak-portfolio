"use client";

import type { ReactNode } from "react";
import { TransitionProvider } from "./Transition";
import SmoothScroll from "./SmoothScroll";
import Cursor from "./Cursor";
import Preloader from "./Preloader";
import Header from "./Header";
import Hud from "./Hud";

/** All persistent chrome. Lives in the root layout so it survives route changes. */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <TransitionProvider>
      <a href="#main" className="skip-link">Skip to content</a>
      <SmoothScroll />
      <Preloader />
      <Header />
      <Hud />
      <Cursor />
      <div className="grain" aria-hidden="true" />
      {children}
    </TransitionProvider>
  );
}
