"use client";

import { useEffect, useRef } from "react";
import { fbm } from "@/lib/terrain";
import { clamp, lerp, smoothstep } from "@/lib/math";

/* Illustrative ocean-colour model.
   A drifting "chlorophyll" field is swept by a pushbroom slit; the spectrum on the right is the
   reflectance of the sampled pixel:  R(λ) = Rw(λ)·exp(−k·C·a(λ)) + backscatter(λ)
   with chlorophyll absorption peaks near 443 nm and 675 nm. Not mission data. */

const BANDS = [443, 490, 555, 670] as const;

const gauss = (x: number, c: number, s: number) => Math.exp(-((x - c) * (x - c)) / (2 * s * s));
const absorb = (l: number) => 1.0 * gauss(l, 443, 24) + 0.4 * gauss(l, 485, 32) + 0.62 * gauss(l, 675, 14) + 0.07;
const water = (l: number) => 0.95 * Math.exp(-(l - 400) / 120) + 0.03;
const reflect = (l: number, c: number) => water(l) * Math.exp(-1.9 * c * absorb(l)) + 0.22 * c * gauss(l, 556, 38) * water(556) + 0.012;

/** wavelength (nm) → approximate visible RGB */
function wl2rgb(w: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  if (w >= 380 && w < 440) { r = -(w - 440) / 60; b = 1; }
  else if (w < 490) { g = (w - 440) / 50; b = 1; }
  else if (w < 510) { g = 1; b = -(w - 510) / 20; }
  else if (w < 580) { r = (w - 510) / 70; g = 1; }
  else if (w < 645) { r = 1; g = -(w - 645) / 65; }
  else if (w <= 700) { r = 1; }
  const f = w < 420 ? 0.3 + (0.7 * (w - 380)) / 40 : w > 680 ? 0.3 + (0.7 * (700 - w)) / 20 : 1;
  return [Math.round(255 * r * f), Math.round(255 * g * f), Math.round(255 * b * f)];
}

const STOPS: [number, number, number, number][] = [
  [0.0, 5, 24, 58],
  [0.26, 11, 74, 122],
  [0.52, 27, 154, 156],
  [0.74, 98, 193, 107],
  [0.9, 200, 224, 74],
  [1.0, 243, 240, 138],
];
function colormap(t: number, out: Uint8ClampedArray, o: number, dim: number) {
  t = clamp(t, 0, 1);
  let i = 1;
  while (i < STOPS.length - 1 && t > STOPS[i][0]) i++;
  const a = STOPS[i - 1], b = STOPS[i];
  const k = (t - a[0]) / (b[0] - a[0]);
  out[o] = lerp(a[1], b[1], k) * dim;
  out[o + 1] = lerp(a[2], b[2], k) * dim;
  out[o + 2] = lerp(a[3], b[3], k) * dim;
  out[o + 3] = 255;
}

const GW = 168, GH = 120;

export default function OscarVisual() {
  const root = useRef<HTMLDivElement>(null);
  const sceneCv = useRef<HTMLCanvasElement>(null);
  const specCv = useRef<HTMLCanvasElement>(null);
  const readBG = useRef<HTMLSpanElement>(null);
  const readC = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const scene = sceneCv.current!, spec = specCv.current!, rootEl = root.current!;
    const sctx = scene.getContext("2d")!, pctx = spec.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const off = document.createElement("canvas");
    off.width = GW; off.height = GH;
    const octx = off.getContext("2d")!;
    const img = octx.createImageData(GW, GH);
    const field = new Float32Array(GW * GH);

    let t = 0, slit = 0, visible = true, raf = 0, last = performance.now();
    const sample = { x: 0.62, y: 0.42, manual: false };
    let dpr = 1, sw = 1, sh = 1, pw = 1, ph = 1;

    const computeField = () => {
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          const u = x / GW, v = y / GH;
          const wx = u * 4.2 + t * 0.06, wy = v * 3.0 - t * 0.035;
          const warp = fbm(wx * 0.8 + 11, wy * 0.8, 5, 2) * 0.9;
          const n = fbm(wx + warp, wy - warp * 0.6, 17, 4);
          // bloom filaments: thresholded, soft-edged
          field[y * GW + x] = clamp(smoothstep(-0.12, 0.42, n) * 0.95 + 0.04 * Math.sin(u * 40 + t), 0, 1);
        }
      }
    };

    const drawScene = () => {
      const sx = slit * GW;
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          const c = field[y * GW + x];
          const behind = x <= sx;
          const fade = behind ? 1 : 0.22;
          colormap(c, img.data, (y * GW + x) * 4, fade);
        }
      }
      octx.putImageData(img, 0, 0);
      sctx.imageSmoothingEnabled = true;
      sctx.clearRect(0, 0, sw, sh);
      sctx.drawImage(off, 0, 0, sw, sh);
      // sensor-pixel grid
      sctx.strokeStyle = "rgba(6,7,11,0.22)";
      sctx.lineWidth = 1;
      const cw = sw / GW * 4, ch = sh / GH * 4;
      sctx.beginPath();
      for (let x = 0; x <= sw; x += cw) { sctx.moveTo(x, 0); sctx.lineTo(x, sh); }
      for (let y = 0; y <= sh; y += ch) { sctx.moveTo(0, y); sctx.lineTo(sw, y); }
      sctx.stroke();
      // slit
      const px = slit * sw;
      const grd = sctx.createLinearGradient(px - 26, 0, px, 0);
      grd.addColorStop(0, "rgba(255,91,46,0)");
      grd.addColorStop(1, "rgba(255,91,46,0.28)");
      sctx.fillStyle = grd;
      sctx.fillRect(px - 26, 0, 26, sh);
      sctx.fillStyle = "rgb(255,120,80)";
      sctx.fillRect(px - 0.5, 0, 1.5, sh);
      // sample reticle
      const rx = sample.x * sw, ry = sample.y * sh;
      sctx.strokeStyle = "rgba(236,231,219,0.95)";
      sctx.lineWidth = 1;
      sctx.beginPath();
      sctx.arc(rx, ry, 9, 0, Math.PI * 2);
      sctx.moveTo(rx - 16, ry); sctx.lineTo(rx - 5, ry); sctx.moveTo(rx + 5, ry); sctx.lineTo(rx + 16, ry);
      sctx.moveTo(rx, ry - 16); sctx.lineTo(rx, ry - 5); sctx.moveTo(rx, ry + 5); sctx.lineTo(rx, ry + 16);
      sctx.stroke();
    };

    const drawSpectrum = () => {
      const gx = clamp(Math.floor(sample.x * GW), 0, GW - 1), gy = clamp(Math.floor(sample.y * GH), 0, GH - 1);
      const c = field[gy * GW + gx];
      const L = { l: 36, r: 14, t: 66, b: 52 };
      const w = pw - L.l - L.r, h = ph - L.t - L.b;
      pctx.clearRect(0, 0, pw, ph);
      const X = (l: number) => L.l + ((l - 400) / 300) * w;
      const Y = (r: number) => L.t + h - clamp(r, 0, 1.02) * h;

      // grid
      pctx.strokeStyle = "rgba(236,231,219,0.08)";
      pctx.lineWidth = 1;
      pctx.font = `10px var(--font-mono), monospace`;
      pctx.fillStyle = "rgba(163,160,148,0.9)";
      pctx.textAlign = "center";
      for (const l of [400, 450, 500, 550, 600, 650, 700]) {
        pctx.beginPath(); pctx.moveTo(X(l), L.t); pctx.lineTo(X(l), L.t + h); pctx.stroke();
        pctx.fillText(String(l), X(l), L.t + h + 14);
      }
      pctx.textAlign = "right";
      for (const r of [0, 0.5, 1]) {
        pctx.beginPath(); pctx.moveTo(L.l, Y(r)); pctx.lineTo(L.l + w, Y(r)); pctx.stroke();
        pctx.fillText(r.toFixed(1), L.l - 6, Y(r) + 3);
      }
      pctx.textAlign = "left";
      pctx.fillText("nm", L.l + w - 10, L.t + h + 14);

      // visible-spectrum strip
      const sg = pctx.createLinearGradient(L.l, 0, L.l + w, 0);
      for (let l = 400; l <= 700; l += 20) { const [r, g, b] = wl2rgb(l); sg.addColorStop((l - 400) / 300, `rgb(${r},${g},${b})`); }
      pctx.fillStyle = sg;
      pctx.globalAlpha = 0.85;
      pctx.fillRect(L.l, L.t + h + 22, w, 7);
      pctx.globalAlpha = 1;

      // clear-water reference
      pctx.strokeStyle = "rgba(169,216,255,0.35)";
      pctx.setLineDash([3, 4]);
      pctx.beginPath();
      for (let l = 400; l <= 700; l += 3) { const y = Y(reflect(l, 0)); l === 400 ? pctx.moveTo(X(l), y) : pctx.lineTo(X(l), y); }
      pctx.stroke();
      pctx.setLineDash([]);

      // sampled pixel
      const path = new Path2D();
      for (let l = 400; l <= 700; l += 2) { const y = Y(reflect(l, c)); l === 400 ? path.moveTo(X(l), y) : path.lineTo(X(l), y); }
      const fill = new Path2D(path);
      fill.lineTo(X(700), Y(0)); fill.lineTo(X(400), Y(0)); fill.closePath();
      const fg = pctx.createLinearGradient(0, L.t, 0, L.t + h);
      fg.addColorStop(0, "rgba(255,91,46,0.30)"); fg.addColorStop(1, "rgba(255,91,46,0)");
      pctx.fillStyle = fg; pctx.fill(fill);
      pctx.strokeStyle = "rgb(255,120,80)"; pctx.lineWidth = 1.8; pctx.stroke(path);

      // band markers
      pctx.font = `9.5px var(--font-mono), monospace`;
      BANDS.forEach((b) => {
        const x = X(b), y = Y(reflect(b, c));
        pctx.strokeStyle = "rgba(236,231,219,0.22)"; pctx.lineWidth = 1; pctx.setLineDash([2, 3]);
        pctx.beginPath(); pctx.moveTo(x, y); pctx.lineTo(x, L.t + h); pctx.stroke(); pctx.setLineDash([]);
        pctx.fillStyle = "rgb(236,231,219)"; pctx.beginPath(); pctx.arc(x, y, 3.2, 0, Math.PI * 2); pctx.fill();
        pctx.fillStyle = "rgba(236,231,219,0.75)"; pctx.textAlign = "center";
        pctx.fillText(`${b}`, x, Math.max(L.t + 10, y - 9));
      });

      const bg = reflect(443, c) / reflect(555, c);
      if (readBG.current) readBG.current.textContent = bg.toFixed(2);
      if (readC.current) readC.current.textContent = c.toFixed(2);
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const a = scene.getBoundingClientRect(), b = spec.getBoundingClientRect();
      sw = Math.max(1, a.width); sh = Math.max(1, a.height); pw = Math.max(1, b.width); ph = Math.max(1, b.height);
      scene.width = sw * dpr; scene.height = sh * dpr; spec.width = pw * dpr; spec.height = ph * dpr;
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0); pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      computeField(); drawScene(); drawSpectrum();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      t += dt;
      slit = (slit + dt * 0.11) % 1.04;
      if (!sample.manual) {
        // wander along the bloom, following the slit
        sample.x = clamp(slit - 0.02, 0.04, 0.96);
        sample.y = 0.5 + 0.34 * Math.sin(t * 0.55) * Math.cos(t * 0.21);
      }
      computeField();
      drawScene();
      drawSpectrum();
    };

    const onMove = (e: PointerEvent) => {
      const r = scene.getBoundingClientRect();
      sample.x = clamp((e.clientX - r.left) / r.width, 0.01, 0.99);
      sample.y = clamp((e.clientY - r.top) / r.height, 0.01, 0.99);
      sample.manual = true;
      if (reduced) { drawScene(); drawSpectrum(); }
    };
    const onLeave = () => { sample.manual = false; };
    scene.addEventListener("pointermove", onMove);
    scene.addEventListener("pointerleave", onLeave);

    const ro = new ResizeObserver(resize);
    ro.observe(scene); ro.observe(spec);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: "60px" });
    io.observe(rootEl);
    resize();
    if (reduced) { slit = 0.6; t = 12; computeField(); drawScene(); drawSpectrum(); }
    else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      scene.removeEventListener("pointermove", onMove);
      scene.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={root} className="absolute inset-0 grid grid-rows-[1.15fr_1fr] gap-px bg-bone/10 sm:grid-cols-[1.05fr_1fr] sm:grid-rows-1">
      <div className="relative bg-ink" data-cursor="scan">
        <canvas ref={sceneCv} className="absolute inset-0 h-full w-full" aria-label="Simulated chlorophyll field swept by a pushbroom spectrometer slit" role="img" />
        <div className="pointer-events-none absolute left-4 top-4">
          <p className="label label-strong">Ocean scene · pushbroom slit</p>
          <p className="label mt-1 !normal-case !tracking-normal">Hover to sample any pixel</p>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-4 right-4 flex items-center gap-3">
          <span className="label">Low</span>
          <span className="h-1.5 flex-1 [background:linear-gradient(90deg,#051a3a,#0b4a7a,#1b9a9c,#62c16b,#c8e04a,#f3f08a)]" />
          <span className="label">High chlorophyll</span>
        </div>
      </div>

      <div className="relative bg-ink">
        <canvas ref={specCv} className="absolute inset-0 h-full w-full" aria-label="Reflectance spectrum of the sampled pixel, 400 to 700 nanometres" role="img" />
        <div className="pointer-events-none absolute left-4 top-4 right-4 flex items-start justify-between gap-4">
          <div>
            <p className="label label-strong">Sampled spectrum</p>
            <p className="label mt-1 !normal-case !tracking-normal">Reflectance vs wavelength</p>
          </div>
          <dl className="text-right">
            <dt className="label">Blue ÷ green</dt>
            <dd className="h-display text-[1.5rem] leading-none tnum"><span ref={readBG}>0.00</span></dd>
            <dt className="label mt-2">Chl index</dt>
            <dd className="mono tnum text-[0.9rem] text-laser"><span ref={readC}>0.00</span></dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
