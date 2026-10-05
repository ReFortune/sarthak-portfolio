"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentType } from "react";
import type { VisualKind } from "@/data/projects";

const Loading = () => (
  <div className="grid h-full w-full place-items-center">
    <p className="label">Loading instrument…</p>
  </div>
);

const visuals: Record<VisualKind, ComponentType> = {
  nova: dynamic(() => import("./visuals/NovaVisual"), { ssr: false, loading: Loading }),
  route: dynamic(() => import("./visuals/RouteVisual"), { ssr: false, loading: Loading }),
  oscar: dynamic(() => import("./visuals/OscarVisual"), { ssr: false, loading: Loading }),
  sparrow: dynamic(() => import("./visuals/SparrowVisual"), { ssr: false, loading: Loading }),
  planner: dynamic(() => import("./visuals/PlannerVisual"), { ssr: false, loading: Loading }),
  chiron: dynamic(() => import("./visuals/ChironVisual"), { ssr: false, loading: Loading }),
};

/** Mounts a visual only once its card is near the viewport (keeps the initial page light). */
export default function Visual({ kind }: { kind: VisualKind }) {
  const host = useRef<HTMLDivElement>(null);
  const [mount, setMount] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setMount(true);
          io.disconnect();
        }
      },
      { rootMargin: "700px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const V = visuals[kind];
  return (
    <div ref={host} className="absolute inset-0">
      {mount ? <V /> : <Loading />}
    </div>
  );
}
