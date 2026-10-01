"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "@/lib/gsap";

/**
 * Portrait with a "point-cloud loupe": the photo is the default view; under the
 * cursor (or a tap) a lens reveals the same image as a scanned dot-matrix.
 */
export default function PortraitLens({ src, alt }: { src: string; alt: string }) {
  const box = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = box.current;
    const canvas = cvs.current;
    if (!el || !canvas) return;
    let cancelled = false;

    const draw = (img: HTMLImageElement) => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);

      const cell = Math.max(5, Math.round(w / 64));
      const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
      const off = document.createElement("canvas");
      off.width = cols; off.height = rows;
      const o = off.getContext("2d")!;
      // object-cover sampling, face kept high in the frame
      const ir = img.naturalWidth / img.naturalHeight, cr = cols / rows;
      let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
      if (ir > cr) { sw = sh * cr; sx = (img.naturalWidth - sw) / 2; }
      else { sh = sw / cr; sy = (img.naturalHeight - sh) * 0.3; }
      o.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
      const d = o.getImageData(0, 0, cols, rows).data;

      ctx.fillStyle = "rgba(6,7,11,0.94)";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          const r = Math.pow(lum, 1.6) * cell * 0.62;
          if (r < 0.25) continue;
          // cool blue shadows → ice highlights, matching the terrain palette
          const k = Math.min(1, lum * 1.15);
          ctx.fillStyle = `rgb(${Math.round(60 + 140 * k)},${Math.round(130 + 100 * k)},${Math.round(190 + 65 * k)})`;
          ctx.beginPath();
          ctx.arc(x * cell + cell / 2, y * cell + cell / 2, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const img = new window.Image();
    img.onload = () => !cancelled && draw(img);
    img.src = src;
    const ro = new ResizeObserver(() => img.complete && draw(img));
    ro.observe(el);

    /* lens */
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const setPos = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--lx", `${e.clientX - r.left}px`);
      el.style.setProperty("--ly", `${e.clientY - r.top}px`);
    };
    const grow = () => gsap.to(el, { "--lr": 150, duration: 0.6, ease: "expo.out", overwrite: "auto" });
    const shrink = () => gsap.to(el, { "--lr": 0, duration: 0.6, ease: "expo.out", overwrite: "auto" });
    const enter = (e: PointerEvent) => { setPos(e); grow(); };
    const move = (e: PointerEvent) => setPos(e);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", shrink);
    if (!fine) {
      el.addEventListener("pointerup", shrink);
      el.addEventListener("pointercancel", shrink);
    }

    return () => {
      cancelled = true;
      ro.disconnect();
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", shrink);
      el.removeEventListener("pointerup", shrink);
      el.removeEventListener("pointercancel", shrink);
    };
  }, [src]);

  return (
    <div
      ref={box}
      data-cursor="view"
      data-cursor-label="Scan"
      className="lens ticks relative aspect-[4/5] w-full overflow-hidden bg-ink-3 touch-pan-y"
      style={{ ["--lr" as string]: 0 }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(min-width: 1024px) 28vw, 80vw"
        priority={false}
        className="object-cover object-[50%_28%] [filter:grayscale(0.2)_contrast(1.05)]"
      />
      <canvas ref={cvs} aria-hidden="true" className="lens-dots absolute inset-0 h-full w-full" />
      <span aria-hidden="true" className="lens-ring pointer-events-none absolute" />
    </div>
  );
}
