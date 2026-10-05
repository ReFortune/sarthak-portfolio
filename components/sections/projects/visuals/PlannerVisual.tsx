"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { cursorReadout } from "@/lib/store";
import {
  FRAME_S,
  FRAMES,
  GH,
  GW,
  frameAt,
  getWorld,
  isLitAt,
  keepOutMask,
  plan,
  sampleRoute,
  standable,
  type Algo,
  type KeepOut,
  type Objective,
  type PlanParams,
  type PlanResult,
  type RoverSample,
  type World,
} from "./plannerEngine";
import { FRAME_LABEL, SCENARIOS, cellOf, type Overlay, type Scenario } from "./plannerScenes";
import { BONE, ICE, createRenderer, prepareRoute, type FrameState, type PreparedRoute, type Renderer } from "./plannerRender";

/** Rover speed in the demo, 10 km/h. */
const SPEED = 10 / 3.6;
const ASPECT = GW / GH;
const MAX_ZONES = 5;
const COLORS = { fastest: ICE, safest: BONE } as const;
const NAME: Record<Objective, string> = { fastest: "Fastest", safest: "Safest" };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = (t: number) => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const fmtDur = (s: number) => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const fmtMin = (s: number) => (s < 5 ? "none" : `${(s / 60).toFixed(1)} min`);
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

type Settings = { objective: Objective; requireLight: boolean; slopeAware: boolean; algo: Algo; departFrame: number };

/** A route-planning demo: plan, compare, wait for the sun, on a procedural patch of cratered terrain. */
export default function PlannerVisual() {
  const root = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const clockEl = useRef<HTMLSpanElement>(null);
  const playhead = useRef<SVGLineElement>(null);
  const scrubber = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const first = SCENARIOS[0];
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [scenarioId, setScenarioId] = useState<Scenario["id"]>(first.id);
  const [settings, setSettings] = useState<Settings>({ objective: first.objective, requireLight: first.requireLight, slopeAware: false, algo: "astar", departFrame: first.departFrame });
  const [overlay, setOverlay] = useState<Overlay>(first.overlay);
  const [showSearch, setShowSearch] = useState(false);
  const [start, setStart] = useState(cellOf(first.start));
  const [goal, setGoal] = useState(cellOf(first.goal));
  const [zones, setZones] = useState<KeepOut[]>(first.zones);
  const [tool, setTool] = useState<"move" | "zone">("move");
  const [advanced, setAdvanced] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [other, setOther] = useState<{ objective: Objective; ok: boolean; distance: number; time: number; steepest: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [badPin, setBadPin] = useState<"A" | "B" | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** Bumped to force a re-plan (with a replay) when the instrument first scrolls into view. */
  const [nonce, setNonce] = useState(0);

  const { objective, requireLight, slopeAware, algo, departFrame } = settings;

  /** Everything the animation loop reads — kept in refs so a frame never waits on React. */
  const live = useRef({ overlay, showSearch, zones, departFrame, objective, tool });
  live.current = { overlay, showSearch, zones, departFrame, objective, tool };
  const an = useRef({
    route: null as PlanResultRoute | null,
    prep: null as PreparedRoute | null,
    ghost: null as PreparedRoute | null,
    ghostColor: ICE as readonly [number, number, number],
    order: new Int32Array(0) as Int32Array,
    exploredN: 0,
    exploredColor: ICE as readonly [number, number, number],
    exploredAlpha: 0,
    reveal: 1,
    replay: null as null | { t0: number; auto: boolean },
    wantReplay: false,
    wantAuto: false,
    simT: 0,
    trip: 0,
    rate: 1,
    playing: false,
    started: false,
    rover: { x: 0, y: 0, seg: 0, waiting: false, dist: 0 } as RoverSample,
    draft: null as KeepOut | null,
    visible: false,
    mostlyVisible: false,
    /** The first plan has been made (so a later arrival in view has to ask for a fresh one to run the demo). */
    planned: false,
    raf: 0,
    last: 0,
    touched: false,
    demo: 0,
    reduced: false,
    lastWaiting: false,
    lastPlayHash: 0,
  });

  const kick = useCallback(() => {
    const a = an.current;
    if (!a.raf && a.visible && rendererRef.current) a.raf = requestAnimationFrame(tickRef.current);
  }, []);
  const tickRef = useRef<(now: number) => void>(() => {});

  /* ── the animation loop ─────────────────────────────────────────────── */
  tickRef.current = (now: number) => {
    const a = an.current;
    a.raf = 0;
    const world = worldRef.current;
    const r = rendererRef.current;
    if (!world || !r) return;
    const L = live.current;
    const dt = a.last ? Math.min(0.05, (now - a.last) / 1000) : 0;
    a.last = now;
    let busy = false;

    if (a.replay) {
      const SEARCH = 950;
      const DRAW = 700;
      const FADE = 700;
      const e = now - a.replay.t0;
      const total = a.order.length;
      if (e < SEARCH) {
        a.exploredN = Math.floor(total * easeOut(e / SEARCH));
        a.exploredAlpha = 1;
        a.reveal = 0;
      } else if (e < SEARCH + DRAW) {
        a.exploredN = total;
        a.reveal = easeInOut((e - SEARCH) / DRAW);
      } else {
        a.exploredN = total;
        a.reveal = 1;
        const f = (e - SEARCH - DRAW) / FADE;
        a.exploredAlpha = L.showSearch ? 1 : 1 - clamp(f, 0, 1);
        if (f >= 1) {
          const auto = a.replay.auto;
          a.replay = null;
          if (auto && a.prep) startPlay(true);
        }
      }
      busy = true;
    }

    if (a.playing && a.route) {
      a.simT = Math.min(a.trip, a.simT + dt * a.rate);
      if (a.simT >= a.trip) {
        a.playing = false;
        setPlaying(false);
        onPlayEnd();
      }
      busy = a.playing || busy;
    }

    const showRover = a.route && a.started;
    let rover: FrameState["rover"] = null;
    if (showRover && a.route && a.prep) {
      sampleRoute(world, a.route, a.simT, a.rover);
      const seg = a.rover.seg;
      const px = a.prep.pts;
      const along = a.prep.cum[seg] + Math.hypot(a.rover.x - px[seg * 2], a.rover.y - px[seg * 2 + 1]);
      rover = { x: a.rover.x, y: a.rover.y, waiting: a.rover.waiting, trail: along };
      if (a.rover.waiting !== a.lastWaiting) {
        a.lastWaiting = a.rover.waiting;
        setWaiting(a.rover.waiting);
      }
      if (a.rover.waiting) busy = true;
    }

    const sunFrame = frameAt(L.departFrame, a.started ? a.simT : 0);
    if (clockEl.current) {
      const abs = L.departFrame * FRAME_S + (a.started ? a.simT : 0);
      clockEl.current.textContent = `T+${fmtDur(abs)}`;
    }
    if (playhead.current && a.route) {
      const total = a.route.d[a.route.d.length - 1] || 1;
      const x = ((a.started ? a.rover.dist : 0) / total) * 600;
      playhead.current.setAttribute("x1", String(x));
      playhead.current.setAttribute("x2", String(x));
    }
    if (scrubber.current) {
      const pct = a.trip > 0 ? Math.round((a.simT / a.trip) * 100) : 0;
      if (scrubber.current.getAttribute("aria-valuenow") !== String(pct)) {
        scrubber.current.setAttribute("aria-valuenow", String(pct));
        scrubber.current.setAttribute("aria-valuetext", `${fmtDur(a.simT)} of ${fmtDur(a.trip)}`);
      }
    }

    const explored = a.exploredN > 0 && a.exploredAlpha > 0 ? { order: a.order, n: a.exploredN, color: a.exploredColor } : null;
    r.draw({
      overlay: L.overlay,
      sunFrame,
      zones: L.zones,
      draft: a.draft,
      ghost: a.ghost,
      ghostColor: a.ghostColor,
      route: a.prep,
      routeColor: COLORS[L.objective],
      reveal: a.reveal,
      explored,
      exploredAlpha: a.exploredAlpha,
      rover,
      time: now,
    });
    // only keep going while on screen: the IntersectionObserver kicks the loop again when the instrument returns
    if ((busy || a.draft) && a.visible && !a.raf) a.raf = requestAnimationFrame(tickRef.current);
  };

  const startPlay = useCallback(
    (fromStart: boolean) => {
      const a = an.current;
      if (!a.route) return;
      if (fromStart || a.simT >= a.trip) a.simT = 0;
      a.started = true;
      a.playing = true;
      setPlaying(true);
      a.last = 0;
      kick();
    },
    [kick]
  );
  const pause = useCallback(() => {
    an.current.playing = false;
    setPlaying(false);
  }, []);

  /** After the first scripted run, show the other objective once, then stop and hand over. */
  const onPlayEnd = useCallback(() => {
    const a = an.current;
    if (a.touched || a.reduced || a.demo !== 1) return;
    a.demo = 2;
    window.setTimeout(() => {
      if (an.current.touched) return;
      an.current.wantReplay = true;
      an.current.wantAuto = true;
      setSettings((s) => ({ ...s, objective: "safest" }));
    }, 1100);
  }, []);

  /* ── build the world once the instrument is near the screen ───────── */
  useEffect(() => {
    const a = an.current;
    a.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dead = false;
    const t = window.setTimeout(() => {
      try {
        const world = getWorld();
        if (dead || !canvas.current) return;
        worldRef.current = world;
        rendererRef.current = createRenderer(canvas.current, world);
        setReady(true);
      } catch (err) {
        console.warn("Planner unavailable:", err);
        setFailed(true);
      }
    }, 40);
    return () => {
      dead = true;
      window.clearTimeout(t);
      if (a.raf) cancelAnimationFrame(a.raf);
      a.raf = 0;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      cursorReadout.set("");
    };
  }, []);

  /* fit the 3:2 map into whatever room the card gives it */
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const fit = () => {
      const pad = 10;
      const w = Math.max(0, el.clientWidth - pad * 2);
      const h = Math.max(0, el.clientHeight - pad * 2);
      const bw = Math.floor(Math.min(w, h * ASPECT));
      setSize((s) => (s.w === bw ? s : { w: bw, h: Math.floor(bw / ASPECT) }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !ready || size.w === 0) return;
    const lowPower = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820;
    r.resize(size.w, size.h, Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
    kick();
  }, [ready, size, kick]);

  /* only paint while on screen; the first time it is mostly in view, run the scripted demo */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        // a busy main thread queues several entries before the callback runs: the last one is the current state
        const e = entries[entries.length - 1];
        const a = an.current;
        a.visible = e.isIntersecting;
        a.mostlyVisible = e.isIntersecting && e.intersectionRatio >= 0.3;
        // Off-screen the loop just stops (nothing is painted and the drive's clock stands still), so a drive in
        // progress picks up where it left off when the visitor scrolls back instead of freezing mid-route.
        if (!e.isIntersecting) return;
        a.last = 0;
        kick();
        // Arrived after the first plan was already drawn: plan again so the demo starts with its replay. Only once a plan
        // exists — if the first plan is still on its way it will see `mostlyVisible` itself, and a second plan queued behind
        // it would cancel the replay it just started.
        if (a.mostlyVisible && a.demo === 0 && !a.reduced && !a.touched && a.planned) setNonce((n) => n + 1);
      },
      { threshold: [0, 0.3] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [kick]);

  /* ── planning ────────────────────────────────────────────────────────── */
  const blocked = useMemo(() => (ready && worldRef.current ? keepOutMask(worldRef.current, zones) : null), [ready, zones]);

  useEffect(() => {
    const world = worldRef.current;
    if (!ready || !world) return;
    const a = an.current;
    a.planned = true;
    if (a.mostlyVisible && a.demo === 0 && !a.reduced && !a.touched) {
      a.demo = 1;
      a.wantReplay = true;
      a.wantAuto = true;
    }
    const params: PlanParams = { objective, algo, requireLight, slopeAware, departFrame, speed: SPEED, keepOuts: zones, start, goal };
    const res = plan(world, params);
    setResult(res);

    a.order = res.expanded;
    a.exploredColor = COLORS[objective];
    a.playing = false;
    setPlaying(false);
    a.started = false;
    a.simT = 0;
    a.lastWaiting = false;
    setWaiting(false);
    if (res.ok) {
      a.route = res.route;
      a.prep = prepareRoute(world, res.route.cells);
      a.trip = res.stats.time;
      a.rate = Math.max(1, res.stats.time / clamp(res.stats.time / 40, 9, 16));
    } else {
      a.route = null;
      a.prep = null;
      a.trip = 0;
    }
    if (a.wantReplay && !a.reduced) {
      a.replay = { t0: performance.now(), auto: a.wantAuto && res.ok };
      a.reveal = 0;
      a.exploredN = 0;
      a.exploredAlpha = 1;
    } else {
      a.replay = null;
      a.reveal = 1;
      a.exploredN = live.current.showSearch ? res.expanded.length : 0;
      a.exploredAlpha = live.current.showSearch ? 1 : 0;
    }
    a.wantReplay = false;
    a.wantAuto = false;
    kick();

    // the other objective, for comparison — computed after the main route has been shown
    a.ghost = null;
    setOther(null);
    const otherObjective: Objective = objective === "fastest" ? "safest" : "fastest";
    const id = window.setTimeout(() => {
      const g = plan(world, { ...params, objective: otherObjective });
      an.current.ghost = g.ok ? prepareRoute(world, g.route.cells) : null;
      an.current.ghostColor = COLORS[otherObjective];
      setOther(
        g.ok
          ? { objective: otherObjective, ok: true, distance: g.stats.distance, time: g.stats.time, steepest: g.stats.steepest }
          : { objective: otherObjective, ok: false, distance: 0, time: 0, steepest: 0 }
      );
      kick();
    }, 140);
    return () => window.clearTimeout(id);
  }, [ready, objective, algo, requireLight, slopeAware, departFrame, zones, start, goal, nonce, kick]);

  /* anything that changes the picture but not the plan */
  useEffect(() => {
    const a = an.current;
    if (!a.replay) {
      a.exploredN = showSearch ? a.order.length : 0;
      a.exploredAlpha = showSearch ? 1 : 0;
    }
    kick();
  }, [overlay, showSearch, zones, kick]);

  /* the notice clears itself */
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(id);
  }, [notice]);

  /* ── interaction ─────────────────────────────────────────────────────── */
  const touch = () => {
    an.current.touched = true;
    an.current.demo = 3;
  };

  const loadScenario = (s: Scenario) => {
    touch();
    const a = an.current;
    a.wantReplay = true;
    a.wantAuto = false;
    setScenarioId(s.id);
    setSettings((st) => ({ ...st, objective: s.objective, requireLight: s.requireLight, departFrame: s.departFrame }));
    setOverlay(s.overlay);
    setStart(cellOf(s.start));
    setGoal(cellOf(s.goal));
    setZones(s.zones);
    setTool("move");
  };

  const change = (patch: Partial<Settings>, replay = true) => {
    touch();
    an.current.wantReplay = replay;
    an.current.wantAuto = false;
    setSettings((s) => ({ ...s, ...patch }));
  };

  const cellAt = (clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    return { fx, fy, cx: clamp(Math.floor(fx * GW), 0, GW - 1), cy: clamp(Math.floor(fy * GH), 0, GH - 1) };
  };

  /* pins: drag or arrow keys */
  const drag = useRef<{ which: "A" | "B"; last: number; at: number } | null>(null);
  const setPin = (which: "A" | "B", cell: number) => (which === "A" ? setStart(cell) : setGoal(cell));
  const pinCell = (which: "A" | "B") => (which === "A" ? start : goal);

  const onPinDown = (which: "A" | "B") => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    touch();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { which, last: pinCell(which), at: 0 };
    e.stopPropagation();
  };
  const onPinMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const world = worldRef.current;
    if (!d || !world || !blocked) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    const cell = c.cy * GW + c.cx;
    const other = d.which === "A" ? goal : start;
    const ok = standable(world, cell, blocked) && cell !== other;
    setBadPin(ok ? null : d.which);
    if (!ok || cell === d.last) return;
    // heavier modes re-plan more slowly; never queue plans faster than they can run
    const now = performance.now();
    const lastMs = result?.stats.ms ?? 10;
    if (now - d.at < Math.max(50, lastMs * 1.6)) return;
    d.at = now;
    d.last = cell;
    an.current.wantReplay = false;
    setPin(d.which, cell);
  };
  const onPinUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    setBadPin(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // settle on the cell under the pointer if the last throttled update skipped it
    if (!d || !blocked || !worldRef.current) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    const cell = c.cy * GW + c.cx;
    const other = d.which === "A" ? goal : start;
    if (standable(worldRef.current, cell, blocked) && cell !== other && cell !== pinCell(d.which)) {
      an.current.wantReplay = false;
      setPin(d.which, cell);
    }
  };
  const onPinKey = (which: "A" | "B") => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const v = dir[e.key];
    const world = worldRef.current;
    if (!v || !world || !blocked) return;
    e.preventDefault();
    touch();
    const cur = pinCell(which);
    const other = which === "A" ? goal : start;
    const step = e.shiftKey ? 5 : 1;
    const x0 = cur % GW;
    const y0 = (cur / GW) | 0;
    // step along the direction; hop over ground the rover can't stand on
    for (let k = step; k <= step + 8; k++) {
      const nx = clamp(x0 + v[0] * k, 0, GW - 1);
      const ny = clamp(y0 + v[1] * k, 0, GH - 1);
      const cell = ny * GW + nx;
      if (cell === cur) break;
      if (standable(world, cell, blocked) && cell !== other) {
        an.current.wantReplay = false;
        setPin(which, cell);
        return;
      }
    }
    setBadPin(which);
    setNotice("The rover can’t stand there — too steep, or inside a keep-out zone.");
    window.setTimeout(() => setBadPin(null), 600);
  };

  /* keep-out zones: click a zone to remove it, click empty ground for a 35 m zone, drag to size one */
  const zoneDown = useRef<{ x: number; y: number; px: number; py: number; hit: number } | null>(null);
  const onMapDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== "zone" || e.button !== 0) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    touch();
    e.currentTarget.setPointerCapture(e.pointerId);
    const x = c.fx * GW * 5;
    const y = c.fy * GH * 5;
    const hit = zones.findIndex((z) => Math.hypot(z.x - x, z.y - y) <= z.r);
    zoneDown.current = { x, y, px: e.clientX, py: e.clientY, hit };
    if (hit < 0) an.current.draft = { x, y, r: 35 };
    kick();
  };
  const onMapMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const c = cellAt(e.clientX, e.clientY);
    const world = worldRef.current;
    if (c && world && e.pointerType === "mouse") {
      const i = c.cy * GW + c.cx;
      cursorReadout.set(
        live.current.tool === "zone"
          ? "KEEP-OUT ZONE"
          : `${world.z[i].toFixed(0)} M · ${world.slope[i].toFixed(0)}° · ${isLitAt(world, i, live.current.departFrame * FRAME_S + (an.current.started ? an.current.simT : 0)) ? "SUN" : "SHADE"}`
      );
    }
    const d = zoneDown.current;
    if (!d || d.hit >= 0 || !c) return;
    const r = clamp(Math.hypot(c.fx * GW * 5 - d.x, c.fy * GH * 5 - d.y), 15, 170);
    const moved = Math.hypot(e.clientX - d.px, e.clientY - d.py) > 4;
    an.current.draft = { x: d.x, y: d.y, r: moved ? r : 35 };
    kick();
  };
  const onMapUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = zoneDown.current;
    zoneDown.current = null;
    if (!d) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const draft = an.current.draft;
    an.current.draft = null;
    const moved = Math.hypot(e.clientX - d.px, e.clientY - d.py) > 4;
    if (d.hit >= 0 && !moved) {
      setZones((zs) => zs.filter((_, i) => i !== d.hit));
      an.current.wantReplay = true;
      return;
    }
    if (!draft) return;
    if (zones.length >= MAX_ZONES) {
      setNotice(`At most ${MAX_ZONES} zones — click one to remove it.`);
      kick();
      return;
    }
    // a zone must leave A and B standable
    const next = [...zones, draft];
    const world = worldRef.current;
    if (world) {
      const m = keepOutMask(world, next);
      if (m[start] || m[goal]) {
        setNotice("That zone would cover A or B — move the pin first.");
        kick();
        return;
      }
    }
    an.current.wantReplay = true;
    setZones(next);
  };
  const onMapLeave = () => cursorReadout.set("");

  /* the profile doubles as the drive scrubber */
  const scrub = (clientX: number, el: HTMLElement) => {
    const a = an.current;
    if (!a.route) return;
    touch();
    const rect = el.getBoundingClientRect();
    const f = clamp((clientX - rect.left) / rect.width, 0, 1);
    a.started = true;
    a.playing = false;
    setPlaying(false);
    a.simT = f * a.trip;
    kick();
  };
  const onScrubKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const a = an.current;
    if (!a.route) return;
    const big = e.shiftKey ? 0.1 : 0.02;
    let f = a.trip > 0 ? a.simT / a.trip : 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") f += big;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") f -= big;
    else if (e.key === "Home") f = 0;
    else if (e.key === "End") f = 1;
    else return;
    e.preventDefault();
    touch();
    a.started = true;
    a.playing = false;
    setPlaying(false);
    a.simT = clamp(f, 0, 1) * a.trip;
    kick();
  };
  const scrubbing = useRef(false);

  /* ── readouts ────────────────────────────────────────────────────────── */
  const ok = result?.ok ? result : null;
  const st = ok?.stats;
  const profile = useMemo(() => {
    const world = worldRef.current;
    if (!ok || !world) return null;
    return buildProfile(world, ok.route, settings.departFrame);
  }, [ok, settings.departFrame]);

  const summary = !result
    ? "Planning."
    : ok && st
      ? `${NAME[objective]} route from A to B: ${fmtInt(st.distance)} metres, ${fmtDur(st.time)} minutes, steepest ${Math.round(st.steepest)} degrees, ${Math.round(st.sunShare * 100)} percent in sunlight${st.wait > 5 ? `, including ${fmtMin(st.wait)} waiting for light` : ""}.`
      : `No route. ${result.ok ? "" : result.reason}`;

  const pinPos = (cell: number): CSSProperties => ({ left: `${(((cell % GW) + 0.5) / GW) * 100}%`, top: `${((((cell / GW) | 0) + 0.5) / GH) * 100}%` });
  const activeScenario = SCENARIOS.find((s) => s.id === scenarioId);

  const chipBtn = (on: boolean) =>
    `label border px-2.5 py-1.5 backdrop-blur-sm transition-colors ${on ? "border-laser bg-ink/90 !text-bone" : "border-bone/30 bg-ink/80 !text-bone hover:border-bone/70"}`;
  const overlayButtons = (
    <>
      <button type="button" aria-pressed={overlay === "slope"} onClick={() => setOverlay((o) => (o === "slope" ? "none" : "slope"))} className={chipBtn(overlay === "slope")} data-cursor="link">
        Steepness
      </button>
      <button type="button" aria-pressed={overlay === "sun"} onClick={() => setOverlay((o) => (o === "sun" ? "none" : "sun"))} className={chipBtn(overlay === "sun")} data-cursor="link">
        Sunlight
      </button>
      <button type="button" aria-pressed={showSearch} onClick={() => setShowSearch((v) => !v)} className={chipBtn(showSearch)} data-cursor="link">
        Explored
      </button>
    </>
  );
  const seg = (on: boolean) => `label border px-3 py-2 transition-colors ${on ? "border-laser bg-laser/10 !text-bone" : "border-bone/20 hover:border-bone/60"}`;

  return (
    <div
      ref={root}
      className="absolute inset-0 flex flex-col bg-ink"
      onKeyDown={(e) => {
        if (e.key === "Escape" && advanced) setAdvanced(false);
      }}
    >
      {/* ── map ─────────────────────────────────────────────────────── */}
      <div ref={area} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={box}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none overflow-visible bg-ink-2 outline outline-1 outline-bone/10"
          style={{ width: size.w || undefined, height: size.h || undefined, touchAction: tool === "zone" ? "none" : "pan-y" }}
          data-cursor="scan"
          onPointerDown={onMapDown}
          onPointerMove={onMapMove}
          onPointerUp={onMapUp}
          onPointerCancel={onMapUp}
          onPointerLeave={onMapLeave}
        >
          <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 shadow-[inset_0_0_90px_rgba(6,7,11,0.62)]" />

          {!ready && !failed && <p className="label absolute inset-0 grid place-items-center">Building terrain…</p>}
          {failed && <p className="label absolute inset-0 grid place-items-center px-8 text-center">The planner needs a browser with canvas support.</p>}

          {ready && (
            <>
              {/* a plan that fails says why, on the map */}
              {result && !result.ok && (
                <div role="alert" className="pointer-events-none absolute left-2 top-2 max-w-[66%] border border-laser/70 bg-ink/90 px-2.5 py-2 backdrop-blur-sm md:left-3 md:top-3 md:px-3">
                  <p className="label !text-[0.62rem] !text-laser">No route</p>
                  <p className="label mt-1 !text-[0.62rem] !leading-snug !text-bone">{result.reason}</p>
                </div>
              )}

              {/* overlays (on the map from sm up; a row below it on phones) */}
              <div className="absolute right-2 top-2 hidden flex-col items-end gap-1.5 sm:flex md:right-3 md:top-3">{overlayButtons}</div>

              {/* legend */}
              <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap items-center gap-x-3 gap-y-1 border border-bone/20 bg-ink/88 px-2.5 py-1.5 backdrop-blur-sm md:bottom-3 md:left-3">
                <span className="label flex items-center gap-1.5 !text-[0.6rem] !text-bone">
                  <i className="block h-0.5 w-4" style={{ background: "rgb(169 216 255)" }} />
                  Fastest
                </span>
                <span className="label flex items-center gap-1.5 !text-[0.6rem] !text-bone">
                  <i className="block h-0.5 w-4" style={{ background: "rgb(236 231 219)" }} />
                  Safest
                </span>
                {overlay === "slope" && (
                  <>
                    <span className="label flex items-center gap-1.5 !text-[0.6rem] !text-bone"><i className="block h-2 w-2" style={{ background: "rgb(240 184 92)" }} />≤ 25°</span>
                    <span className="label flex items-center gap-1.5 !text-[0.6rem] !text-bone"><i className="block h-2 w-2" style={{ background: "rgb(255 91 46)" }} />No-go</span>
                  </>
                )}
                {overlay === "sun" && (
                  <>
                    <span className="label flex items-center gap-1.5 !text-[0.6rem] !text-bone"><i className="block h-2 w-2 border border-bone/40 bg-[#060a1e]" />Shadow</span>
                    <span ref={clockEl} className="label tnum !text-[0.6rem] !text-bone">T+0:00</span>
                  </>
                )}
              </div>

              {notice && (
                <p role="status" className="label absolute bottom-2 right-2 max-w-[60%] border border-laser/60 bg-ink/85 px-2.5 py-1.5 !text-[0.62rem] !normal-case !tracking-normal !text-bone md:bottom-3 md:right-3">
                  {notice}
                </p>
              )}

              {/* pins */}
              {(["A", "B"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-label={`${w === "A" ? "Start" : "Goal"} ${w}, column ${(pinCell(w) % GW) + 1}, row ${((pinCell(w) / GW) | 0) + 1}. Arrow keys move it; hold Shift for bigger steps.`}
                  onPointerDown={onPinDown(w)}
                  onPointerMove={onPinMove}
                  onPointerUp={onPinUp}
                  onPointerCancel={onPinUp}
                  onKeyDown={onPinKey(w)}
                  data-cursor="drag"
                  data-cursor-label="Move"
                  className={`absolute z-10 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center border font-mono text-[0.68rem] leading-none backdrop-blur-sm transition-colors before:absolute before:-inset-3 before:content-[''] [touch-action:none] ${
                    badPin === w ? "border-laser bg-laser/30 text-bone" : "border-bone bg-ink/85 text-bone hover:bg-bone hover:text-ink"
                  }`}
                  style={pinPos(pinCell(w))}
                >
                  {w}
                </button>
              ))}
            </>
          )}
        </div>
        <p className="sr-only" aria-live="polite">{summary}</p>
      </div>

      {ready && <div className="flex items-center gap-2 border-t border-bone/10 px-3 py-2 sm:hidden">{overlayButtons}</div>}

      {/* ── route dock: stats + the height / sunlight profile ─────────── */}
      <div className="border-t border-bone/10 px-3 py-2.5 md:px-4">
        <div className="grid items-end gap-x-5 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dl className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-[repeat(6,auto)]">
            {[
              ["Distance", st ? `${fmtInt(st.distance)} m` : "—"],
              ["Trip", st ? fmtDur(st.time) : "—"],
              ["Waited", st ? fmtMin(st.wait) : "—"],
              ["Steepest", st ? `${Math.round(st.steepest)}°` : "—"],
              ["Sunlit", st ? `${Math.round(st.sunShare * 100)}%` : "—"],
              ["Explored", result ? fmtInt(result.stats.explored) : "—"],
            ].map(([k, v]) => (
              <div key={k} className={["Steepest", "Sunlit", "Explored"].includes(k) ? "hidden sm:block" : undefined}>
                <dt className="label !text-[0.58rem]">{k}</dt>
                <dd className={`mono tnum mt-0.5 text-[0.8rem] ${k === "Distance" ? "!text-[0.95rem] text-laser" : "text-bone"}`}>{v}</dd>
              </div>
            ))}
          </dl>

          <div
            ref={scrubber}
            className="relative h-[3.4rem] min-w-0 cursor-pointer touch-none outline-offset-4"
            role="slider"
            tabIndex={ok ? 0 : -1}
            aria-label="Drive position along the route. Arrow keys scrub."
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={0}
            onPointerDown={(e) => {
              scrubbing.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              scrub(e.clientX, e.currentTarget);
            }}
            onPointerMove={(e) => scrubbing.current && scrub(e.clientX, e.currentTarget)}
            onPointerUp={() => (scrubbing.current = false)}
            onPointerCancel={() => (scrubbing.current = false)}
            onKeyDown={onScrubKey}
            data-cursor="drag"
            data-cursor-label="Scrub"
          >
            {profile ? (
              <svg viewBox="0 0 600 54" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <path d={profile.area} fill="rgb(169 216 255 / 0.13)" />
                <path d={profile.line} fill="none" stroke="rgb(236 231 219 / 0.78)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                {profile.sun.map((s, i) => (
                  <rect key={i} x={s.x} y={47} width={s.w} height={5} fill={s.lit ? "rgb(240 184 92 / 0.85)" : "rgb(24 28 39)"} />
                ))}
                {profile.waits.map((x, i) => (
                  <rect key={i} x={x - 1.2} y={4} width={2.4} height={43} fill="rgb(255 91 46 / 0.55)" />
                ))}
                <line ref={playhead} x1={0} x2={0} y1={0} y2={54} stroke="rgb(255 91 46)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            ) : (
              <p className="label grid h-full place-items-center">{result && !result.ok ? "No route to show" : "…"}</p>
            )}
          </div>
        </div>
        <p className="label mt-1.5 flex flex-wrap items-center justify-between gap-x-4 !text-[0.58rem] !normal-case !tracking-normal !text-bone-mute">
          <span>Height along the route · amber strip = in sunlight · red ticks = waiting for light</span>
          {other && other.ok && st && (
            <span className="tnum !text-bone-dim">
              {NAME[other.objective]} instead: {other.distance >= st.distance ? "+" : "−"}
              {fmtInt(Math.abs(other.distance - st.distance))} m · steepest {Math.round(other.steepest)}°
            </span>
          )}
        </p>
      </div>

      {/* ── controls ──────────────────────────────────────────────────── */}
      <div className="relative border-t border-bone/10 p-3 md:p-4">
        {advanced && (
          <div id="planner-advanced" role="group" aria-label="Advanced settings" className="absolute inset-x-3 bottom-full z-30 mb-2 grid gap-x-8 gap-y-4 border border-bone/25 bg-ink/95 p-3 backdrop-blur-md sm:grid-cols-3 md:inset-x-4 md:p-4">
            <div>
              <p className="label mb-1.5">Search method</p>
              <div role="group" aria-label="Search method" className="flex gap-2">
                {([["astar", "A*"], ["dijkstra", "Dijkstra"]] as const).map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={algo === id} onClick={() => change({ algo: id })} className={seg(algo === id)}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="label mt-1.5 !normal-case !leading-snug !tracking-normal !text-bone-dim">Same route either way. Switch on “Explored” to see how much less map A* reads.</p>
            </div>
            <div>
              <p className="label mb-1.5">Slope check</p>
              <button type="button" aria-pressed={slopeAware} onClick={() => change({ slopeAware: !slopeAware })} className={seg(slopeAware)}>
                Uphill &amp; side tilt
              </button>
              <p className="label mt-1.5 !normal-case !leading-snug !tracking-normal !text-bone-dim">Judge each move’s pitch and roll, not just the cell’s slope.</p>
            </div>
            <label className="block">
              <span className="mb-0.5 flex items-baseline justify-between">
                <span className="label">Departure</span>
                <span className="mono tnum text-[0.8rem] text-bone">{FRAME_LABEL(departFrame, FRAME_S)}</span>
              </span>
              <input
                type="range"
                className="slider"
                min={0}
                max={FRAMES - 1}
                step={1}
                value={departFrame}
                onChange={(e) => change({ departFrame: Number(e.target.value) }, false)}
                style={{ ["--fill" as string]: `${(departFrame / (FRAMES - 1)) * 100}%` } as CSSProperties}
              />
              <p className="label mt-0.5 !normal-case !leading-snug !tracking-normal !text-bone-dim">Matters with sunlight-only or the Sunlight overlay on.</p>
            </label>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <div role="group" aria-label="Scenario" className="flex gap-2">
              {SCENARIOS.map((s) => (
                <button key={s.id} type="button" aria-pressed={scenarioId === s.id} onClick={() => loadScenario(s)} className={seg(scenarioId === s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="label order-3 w-full !normal-case !leading-snug !tracking-normal !text-bone-dim sm:order-none sm:ml-2 sm:w-auto sm:min-w-0 sm:flex-1" aria-live="polite">
              {activeScenario?.note}
            </p>
            <button
              type="button"
              aria-expanded={advanced}
              aria-controls="planner-advanced"
              onClick={() => setAdvanced((v) => !v)}
              className={`${seg(advanced)} ml-auto sm:ml-0`}
            >
              Advanced {advanced ? "−" : "+"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Objective" className="flex gap-2">
              {(["fastest", "safest"] as const).map((o) => (
                <button key={o} type="button" aria-pressed={objective === o} onClick={() => change({ objective: o })} className={seg(objective === o)}>
                  {NAME[o]}
                </button>
              ))}
            </div>
            <button type="button" aria-pressed={requireLight} onClick={() => change({ requireLight: !requireLight })} className={seg(requireLight)}>
              Sunlight only
            </button>
            <button
              type="button"
              aria-pressed={tool === "zone"}
              onClick={() => {
                touch();
                setTool((t) => (t === "zone" ? "move" : "zone"));
              }}
              className={seg(tool === "zone")}
            >
              Keep-out zone
            </button>
            {zones.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  touch();
                  an.current.wantReplay = true;
                  setZones([]);
                }}
                className="label border border-bone/20 px-3 py-2 transition-colors hover:border-bone/60"
              >
                Clear zones
              </button>
            )}
            <button
              type="button"
              disabled={!ok}
              onClick={() => {
                touch();
                if (playing) pause();
                else startPlay(false);
              }}
              className={`${seg(playing)} ml-auto disabled:opacity-40`}
              aria-label={playing ? "Pause the drive" : "Watch the drive"}
            >
              {playing ? "Pause" : "▶ Drive"}
            </button>
          </div>

          <p className="label !text-[0.58rem] !normal-case !tracking-normal !text-bone-mute">
            <span className="sm:hidden">Illustrative demo · synthetic terrain · </span>
            <span className="hidden sm:inline">
              Illustrative demo · synthetic terrain, not mission data · the sun swings far faster than real ·{" "}
            </span>
            {algo === "astar" ? "A*" : "Dijkstra"} planned this in {result ? Math.max(1, Math.round(result.stats.ms)) : "…"} ms
          </p>
        </div>
      </div>
    </div>
  );
}

type PlanResultRoute = Extract<PlanResult, { ok: true }>["route"];

/** Height profile + sunlight strip along the route, in a 600 × 54 box. */
function buildProfile(world: World, route: PlanResultRoute, departFrame: number) {
  const { cells, d, t } = route;
  const n = cells.length;
  const total = d[n - 1] || 1;
  const W = 600;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const z = world.z[cells[i]];
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  const span = Math.max(4, hi - lo);
  const x = (dist: number) => (dist / total) * W;
  const y = (z: number) => 6 + (1 - (z - lo) / span) * 34;
  let line = "";
  for (let i = 0; i < n; i++) line += `${i ? "L" : "M"}${x(d[i]).toFixed(1)} ${y(world.z[cells[i]]).toFixed(1)}`;
  const area = `${line}L${W} 46L0 46Z`;

  const sun: { x: number; w: number; lit: boolean }[] = [];
  const dep = departFrame * FRAME_S;
  for (let i = 1; i < n; i++) {
    const lit = isLitAt(world, cells[i], dep + t[i]);
    const x0 = x(d[i - 1]);
    const x1 = x(d[i]);
    const last = sun[sun.length - 1];
    if (last && last.lit === lit) last.w = x1 - last.x;
    else sun.push({ x: x0, w: x1 - x0, lit });
  }
  const waits: number[] = [];
  for (let i = 1; i < n; i++) if (route.wait[i] > 5) waits.push(x(d[i - 1]));
  return { line, area, sun, waits };
}
