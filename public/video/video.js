/* "I measure worlds" — HTML video. One GSAP timeline + a few canvases, all pure functions of time t.
   Preview: open index.html (served). Render: index.html?render=1 then call window.seek(t) per frame. */
(() => {
  const T = window.TIMING;
  const D = T.total + 3.6; // total video length (narration + outro hold)
  const q = new URLSearchParams(location.search);
  const RENDER = q.has("render");
  if (RENDER) document.body.classList.add("render");
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const S = (i) => T.scenes[i - 1];
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const W = (i, key, nth = 0) => {
    const ws = S(i).words;
    if (typeof key === "number") return ws[key].t;
    let c = 0;
    for (const w of ws) if (norm(w.w) === norm(key) && c++ === nth) return w.t;
    throw new Error("word not found: " + key + " in scene " + i);
  };
  const ST = (i) => S(i).start;
  const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  /* ───────── stage scaling ───────── */
  const stage = $("#stage");
  function fit() {
    const ch = RENDER ? 0 : 56;
    const s = Math.min(innerWidth / 1920, (innerHeight - ch) / 1080);
    stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - ch - 1080 * s) / 2}px) scale(${s})`;
  }
  addEventListener("resize", fit); fit();

  /* ───────── noise + terrain background ───────── */
  const hh = (x, z) => { let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
  const vn = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf); const a = hh(xi, zi), b = hh(xi + 1, zi), c = hh(xi, zi + 1), d = hh(xi + 1, zi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const corridor = (z) => 7 * Math.sin(z / 55) + 3 * Math.sin(z / 23 + 1);
  const H = (x, z) => {
    const base = (vn(x * 0.03, z * 0.03) - 0.5) * 9 + (vn(x * 0.11 + 9, z * 0.11) - 0.5) * 2.2;
    const lat = sm(14, 52, Math.abs(x - corridor(z)));
    return base + lat * (Math.pow(1 - Math.abs(vn(x * 0.011, z * 0.011) * 2 - 1), 2.4) * 32 + 6);
  };
  const TIERS = [
    { dx: 0.14, dz: 0.3, z0: 1.5, z1: 18, xh: 8, s: 0.05, seed: 1 },
    { dx: 0.42, dz: 0.85, z0: 16, z1: 50, xh: 22, s: 0.13, seed: 2 },
    { dx: 1.1, dz: 2.2, z0: 46, z1: 135, xh: 60, s: 0.34, seed: 3 },
    { dx: 3, dz: 6, z0: 125, z1: 340, xh: 160, s: 0.9, seed: 4 },
  ];
  const bgc = $("#bg"), bctx = bgc.getContext("2d");
  const img = bctx.createImageData(1920, 1080), buf = img.data;
  const STARS = Array.from({ length: 520 }, (_, i) => ({ x: hh(i, 1) * 1920, y: hh(i, 2), a: 0.25 + hh(i, 3) * 0.75, r: hh(i, 4) < 0.1 ? 2 : 1, k: hh(i, 5) * 6 }));
  const bg = { camH: 6, pitch: 0.17, reveal: 0, dim: 1, stars: 0.5, scanD: 10, glow: 0 };
  function plot(x, y, r, g, b, a, sz) {
    x = x | 0; y = y | 0;
    for (let j = 0; j < sz; j++) for (let i = 0; i < sz; i++) {
      const px = x + i, py = y + j; if (px < 0 || px >= 1920 || py < 0 || py >= 1080) continue;
      const o = (py * 1920 + px) * 4;
      buf[o] += r * a; buf[o + 1] += g * a; buf[o + 2] += b * a; // additive; Uint8Clamped saturates
    }
  }
  function drawBG(t) {
    for (let i = 0; i < buf.length; i += 4) { buf[i] = 6; buf[i + 1] = 7; buf[i + 2] = 11; buf[i + 3] = 255; }
    const camZ = t * 4.2, camX = corridor(camZ);
    const camY = (H(camX, camZ) + H(camX, camZ + 7) + H(camX, camZ + 14)) / 3 + bg.camH;
    const p = bg.pitch, cp = Math.cos(p), sp = Math.sin(p), f = 1150, cx = 960, cy = 540;
    const horizon = cy - f * Math.tan(p);
    // stars
    const sa = bg.stars * bg.dim;
    for (const s of STARS) {
      const sy = s.y * Math.max(0, horizon - 20) ; if (sy > horizon - 6) continue;
      const tw = 0.6 + 0.4 * Math.sin(t * 0.9 + s.k * 3);
      plot(s.x, sy, 190, 215, 255, s.a * tw * sa, s.r);
    }
    const scanZ = camZ + bg.scanD;
    for (const tr of TIERS) {
      const j0 = Math.floor((camZ + tr.z0) / tr.dz), j1 = Math.floor((camZ + tr.z1) / tr.dz);
      const i0 = Math.floor((camX - tr.xh) / tr.dx), i1 = Math.ceil((camX + tr.xh) / tr.dx);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = (i + hh(j, i + 7) * 0.8) * tr.dx, z = (j + hh(i, j + 3) * 0.8) * tr.dz;
          const rz = z - camZ; if (rz < tr.z0 || rz > tr.z1) continue;
          const ds = z - scanZ, behind = ds < 0;
          const rnd = hh(i * 7 + tr.seed, j * 13);
          if (!behind && rnd > 0.55) continue;
          const y = H(x, z);
          const dy = y - camY, dx = x - camX;
          const zz = rz * cp - dy * sp, yy = dy * cp + rz * sp;
          if (zz < 0.8) continue;
          const sx = cx + f * dx / zz, sy = cy - f * yy / zz;
          if (sx < -4 || sx > 1924 || sy < -4 || sy > 1084) continue;
          const dist = Math.hypot(dx, dy, rz);
          let a = Math.min(1, Math.exp(-dist * 0.0046) * (behind ? 1.9 : 0.8) * bg.dim);
          const rv = clamp(1 - (dist - bg.reveal * 360) / 40); a *= rv;
          if (a < 0.02) continue;
          const e = clamp((y + 5) / 17);
          let r = lerp(40, 215, e * e), g = lerp(110, 238, e), b = lerp(190, 255, e);
          const lit = 0.55 + 0.9 * hh(i + 5, j + 9) * (behind ? 1 : 0.5);
          r *= lit; g *= lit; b *= lit;
          let sz = clamp(tr.s * f / zz * 1.5, 1.4, 5);
          if (behind && ds > -0.5 * tr.dz - 0.6 && bg.scanD > 0 && ds > -0.7) { r = 255; g = 110; b = 60; a = Math.min(1, a * 2.2); sz = Math.max(2, sz + 1); }
          plot(sx - sz / 2, sy - sz / 2, r, g, b, a, Math.max(1, Math.round(sz)));
        }
      }
    }
    bctx.putImageData(img, 0, 0);
    bctx.globalCompositeOperation = "lighter";
    const gl = bctx.createRadialGradient(960, horizon, 0, 960, horizon, 900); gl.addColorStop(0, `rgba(70,120,190,${0.2 * bg.dim})`); gl.addColorStop(0.5, `rgba(255,91,46,${0.04 * bg.dim})`); gl.addColorStop(1, "rgba(0,0,0,0)");
    bctx.fillStyle = gl; bctx.fillRect(0, 0, 1920, 1080); bctx.globalCompositeOperation = "source-over";
  }

  /* ───────── portrait dot-matrix (scene 1) ───────── */
  const pc = $("#pc"), pctx = pc.getContext("2d"), ph = $("#ph");
  let dots = null;
  function prepPortrait() {
    const cell = 8, cols = 65, rows = 82;
    const off = document.createElement("canvas"); off.width = cols; off.height = rows;
    const o = off.getContext("2d");
    const ir = ph.naturalWidth / ph.naturalHeight, cr = cols / rows;
    let sw = ph.naturalWidth, sh = ph.naturalHeight, sx = 0, sy = 0;
    if (ir > cr) { sw = sh * cr; sx = (ph.naturalWidth - sw) / 2; } else { sh = sw / cr; sy = (ph.naturalHeight - sh) * 0.28; }
    o.drawImage(ph, sx, sy, sw, sh, 0, 0, cols, rows);
    dots = { cell, cols, rows, d: o.getImageData(0, 0, cols, rows).data };
  }
  function drawPortrait(p) {
    if (!dots) return;
    pctx.clearRect(0, 0, 520, 650);
    pctx.fillStyle = "rgba(6,7,11,.92)"; pctx.fillRect(0, 0, 520, 650 * clamp(p));
    const { cell, cols, rows, d } = dots;
    const lim = Math.floor(rows * clamp(p));
    for (let y = 0; y < lim; y++) for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4, lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      const r = Math.pow(lum, 1.6) * cell * 0.62; if (r < 0.3) continue;
      const k = Math.min(1, lum * 1.15);
      pctx.fillStyle = `rgb(${60 + 140 * k | 0},${130 + 100 * k | 0},${190 + 65 * k | 0})`;
      pctx.beginPath(); pctx.arc(x * cell + cell / 2, y * cell + cell / 2, r, 0, 6.283); pctx.fill();
    }
  }

  /* ───────── scene 4 swath canvas ───────── */
  const swc = $("#sw"), sctx = swc.getContext("2d");
  const ROCKS = [{ x: 567, y: 190, n: [1, 4] }, { x: 725, y: 280, n: [1, 3] }, { x: 867, y: 370, n: [0, 2] }];
  const P1 = [33.8, 49.2], P2 = [50.2, 55.2];
  function drawSwath(t) {
    sctx.clearRect(0, 0, 1000, 480);
    sctx.fillStyle = "rgba(11,13,19,.9)"; sctx.fillRect(0, 0, 1000, 480);
    sctx.strokeStyle = "rgba(236,231,219,.06)"; sctx.lineWidth = 1;
    for (let x = 100; x < 1000; x += 150) { sctx.beginPath(); sctx.moveTo(x, 50); sctx.lineTo(x, 470); sctx.stroke(); }
    const y0 = 70, y1 = 460;
    const p1 = clamp((t - P1[0]) / (P1[1] - P1[0])), p2 = clamp((t - P2[0]) / (P2[1] - P2[0]));
    const yc = y0 + (y1 - y0) * p1, yd = y0 + (y1 - y0) * p2;
    const pts = (ya, yb, dy, dx, dense) => {
      for (let y = ya; y < yb; y += dy) {
        for (let x = 40; x <= 960; x += dx) {
          const off = Math.abs(x - 500) / 460;
          const jit = (hh(x, Math.round(y)) - 0.5) * 2;
          const l = 0.95 - 0.55 * off;
          sctx.fillStyle = `rgba(${(120 + 60 * (1 - off)) | 0},${(200 + 30 * (1 - off)) | 0},255,${l})`;
          sctx.fillRect(x + jit, y, dense ? 2 : 2.5, dense ? 2 : 2.5);
        }
      }
    };
    if (p2 <= 0) pts(y0, yc, 18, 10, false);
    else { pts(y0 + (y1 - y0) * p2 < y1 ? yd : y1, yc, 18, 10, false); pts(y0, yd, 8, 5, true); }
    // rock returns
    ROCKS.forEach((r, k) => {
      const seen = p2 > 0 && yd > r.y ? r.n[1] : yc > r.y ? r.n[0] : 0;
      sctx.fillStyle = "#ff5b2e";
      for (let m = 0; m < seen; m++) sctx.fillRect(r.x - 4 + (m % 2) * 5, r.y - 3 + ((m / 2) | 0) * 5, 4, 4);
    });
    // scan line + fan from the rover
    const ys = p2 > 0 ? yd : yc;
    if ((p1 > 0 && p1 < 1) || (p2 > 0 && p2 < 1)) {
      sctx.strokeStyle = "rgba(255,91,46,.9)"; sctx.lineWidth = 2; sctx.beginPath(); sctx.moveTo(40, ys); sctx.lineTo(960, ys); sctx.stroke();
      sctx.strokeStyle = "rgba(255,91,46,.18)"; sctx.lineWidth = 1;
      for (let x = 40; x <= 960; x += 115) { sctx.beginPath(); sctx.moveTo(500, 44); sctx.lineTo(x, ys); sctx.stroke(); }
    }
    sctx.fillStyle = "#ece7db"; sctx.fillRect(488, 36, 24, 14);
    sctx.fillStyle = "#ff5b2e"; sctx.fillRect(496, 32, 8, 6);
  }

  /* ───────── scene 6 globe canvas ───────── */
  const gc = $("#globe"), gctx = gc.getContext("2d");
  const GP = Array.from({ length: 1100 }, (_, i) => { const y = 1 - 2 * (i + 0.5) / 1100, r = Math.sqrt(1 - y * y), th = i * 2.39996; return { x: r * Math.cos(th), y, z: r * Math.sin(th), k: hh(i, 9), e: vn(r * Math.cos(th) * 3 + 2, y * 3) }; });
  function drawGlobe(t) {
    gctx.clearRect(0, 0, 350, 270);
    const rot = t * 0.7, cs = Math.cos(rot), sn = Math.sin(rot), cov = sm(82.8, 86.5, t) * 0.95, R = 112, cx = 175, cy = 135;
    for (const p of GP) {
      const x = p.x * cs + p.z * sn, z = -p.x * sn + p.z * cs;
      if (z < -0.1) continue;
      const lit = 0.35 + 0.65 * clamp(0.5 + x * 0.4 + p.y * 0.2 + z * 0.4);
      const covered = p.k < cov;
      gctx.fillStyle = covered ? `rgba(169,216,255,${lit})` : `rgba(${(170 + 60 * p.e) | 0},${(80 + 50 * p.e) | 0},${(50 + 30 * p.e) | 0},${lit})`;
      gctx.fillRect(cx + x * R, cy - p.y * R, 2.4, 2.4);
    }
    gctx.strokeStyle = "rgba(169,216,255,.5)"; gctx.lineWidth = 1.5;
    gctx.beginPath(); gctx.ellipse(cx, cy, R * 1.1, R * 0.32, -0.25, 0, 6.283); gctx.stroke();
    const a = t * 1.3; gctx.fillStyle = "#ff5b2e"; gctx.beginPath(); gctx.arc(cx + Math.cos(a) * R * 1.1 * Math.cos(-0.25) - Math.sin(a) * R * 0.32 * Math.sin(-0.25), cy + Math.cos(a) * R * 1.1 * Math.sin(-0.25) + Math.sin(a) * R * 0.32 * Math.cos(-0.25), 5, 0, 6.283); gctx.fill();
  }

  /* ───────── build static SVG bits ───────── */
  // trl bars
  const trlb = $("#trlbars");
  for (let i = 0; i < 9; i++) { const d = document.createElement("div"); d.style.cssText = "flex:1;height:22px;border:1px solid rgba(236,231,219,.3)"; d.className = "tb"; trlb.appendChild(d); }
  // 2x2 trade grid
  const g22 = $("#g22");
  const cell = (txt, extra = "") => { const d = document.createElement("div"); d.style.cssText = "background:#0b0d13;padding:14px 16px;" + extra; d.innerHTML = txt; return d; };
  g22.appendChild(cell("")); g22.appendChild(cell('<span class="mono" style="font-size:18px;color:#ece7db" id="hc0">0.25° inc.</span>')); g22.appendChild(cell('<span class="mono" style="font-size:18px;color:#ece7db" id="hc1">0.5° inc.</span>'));
  [[25, ["27.0k", "13.5k"]], [50, ["54.0k", "27.1k"]]].forEach(([hz, v], r) => {
    g22.appendChild(cell(`<span class="mono" style="font-size:18px;color:#ece7db" id="hr${r}">${hz} Hz</span>`));
    v.forEach((x, c) => { const e = cell(`<div class="disp" style="font-size:42px;line-height:1">${x}<span class="mono" style="font-size:15px;margin-left:8px">pts/s</span></div>`); e.id = `gc${r}${c}`; g22.appendChild(e); });
  });
  // steel bridge truss
  const truss = $("#truss"); {
    const n = 6, w = 488 / n; let d = "";
    for (let i = 0; i < n; i++) { const x = i * w; d += `M${x} 120H${x + w}M${x} 120L${x + w / 2} 30L${x + w} 120`; if (i < n - 1) d += `M${x + w / 2} 30H${x + w * 1.5}`; }
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); p.setAttribute("stroke-linejoin", "round"); truss.appendChild(p);
  }
  // LES network
  const net = $("#net"); {
    const NS = "http://www.w3.org/2000/svg", cx = 224, cy = 115; let html = "";
    const nodes = Array.from({ length: 14 }, (_, i) => { const a = i / 14 * 6.283, r = i % 2 ? 100 : 62; return { x: cx + Math.cos(a) * r * 1.9, y: cy + Math.sin(a) * r * 0.95 }; });
    nodes.forEach((n, i) => { html += `<line class="nl" x1="${cx}" y1="${cy}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}" stroke="rgba(236,231,219,.3)"/>`; if (i) html += `<line class="nl" x1="${nodes[i - 1].x.toFixed(1)}" y1="${nodes[i - 1].y.toFixed(1)}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}" stroke="rgba(169,216,255,.25)"/>`; });
    nodes.forEach((n) => (html += `<circle class="nd" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="7" fill="#ece7db"/>`));
    html += `<circle class="nd" cx="${cx}" cy="${cy}" r="16" fill="#ff5b2e"/>`;
    net.innerHTML = html;
  }
  // OSCAR spectrum
  {
    const g = (x, c, s) => Math.exp(-((x - c) ** 2) / (2 * s * s));
    const ab = (l) => g(l, 443, 24) + 0.4 * g(l, 485, 32) + 0.62 * g(l, 675, 14) + 0.07, wt = (l) => 0.95 * Math.exp(-(l - 400) / 120) + 0.03;
    const rf = (l, c) => wt(l) * Math.exp(-1.9 * c * ab(l)) + 0.22 * c * g(l, 556, 38) * wt(556) + 0.012;
    let d = ""; for (let l = 400; l <= 700; l += 4) d += `${l > 400 ? "L" : "M"}${(20 + (l - 400) / 300 * 320).toFixed(1)} ${(250 - clamp(rf(l, 0.55)) * 215).toFixed(1)}`;
    $("#spec").setAttribute("d", d);
  }
  // Venn (scene 3)
  const venn = $("#venn"); {
    const NS = "http://www.w3.org/2000/svg", names = ["Structures", "Electronics", "Software", "Orbits", "Operations"];
    let html = `<defs><radialGradient id="vg"><stop offset="0" stop-color="#ff5b2e" stop-opacity=".55"/><stop offset="1" stop-color="#ff5b2e" stop-opacity="0"/></radialGradient></defs>`;
    names.forEach((n, i) => { const a = -Math.PI / 2 + i * 1.2566, x = 960 + Math.cos(a) * 190, y = 470 + Math.sin(a) * 190, lx = 960 + Math.cos(a) * 480, ly = 470 + Math.sin(a) * 400;
      html += `<circle class="vc" cx="${x}" cy="${y}" r="250" fill="rgba(169,216,255,.05)" stroke="rgba(169,216,255,.55)" stroke-width="2"/><text class="vt" x="${lx}" y="${ly}" text-anchor="middle" fill="#a3a094" font-family="Fragment Mono" font-size="24" letter-spacing="3">${n.toUpperCase()}</text>`; });
    html += `<circle id="vglow" cx="960" cy="470" r="10" fill="url(#vg)"/>`;
    venn.innerHTML = html;
  }
  // name letters
  $$("#nm .nl").forEach((n) => { const t = n.textContent; n.textContent = ""; n.style.cssText = "overflow:hidden;padding:0 0 .06em;"; [...t].forEach((c) => { const s = document.createElement("span"); s.textContent = c; s.style.display = "inline-block"; n.appendChild(s); }); });
  // end fade
  const blk = document.createElement("div"); blk.style.cssText = "position:absolute;inset:0;background:#000;opacity:0;z-index:60"; stage.appendChild(blk);

  /* ───────── captions ───────── */
  const caps = $("#caps");
  const capSpans = [];
  T.scenes.forEach((sc) => {
    const toks = sc.text.split(/\s+/); const ok = toks.length === sc.words.length;
    let chunk = [], chunks = [];
    sc.words.forEach((w, i) => {
      chunk.push({ w, txt: ok ? toks[i] : w.w });
      const end = /[,.:;]$/.test(chunk[chunk.length - 1].txt);
      const chars = chunk.reduce((n, c) => n + c.txt.length + 1, 0);
      if ((end && chunk.length >= 4) || chunk.length >= 8 || chars >= 46) { chunks.push(chunk); chunk = []; }
    });
    if (chunk.length) { if (chunks.length && chunk.length < 3) chunks[chunks.length - 1].push(...chunk); else chunks.push(chunk); }
    chunks.forEach((ch) => {
      const el = document.createElement("div"); el.className = "cap";
      ch.forEach((c) => { const sp = document.createElement("span"); sp.textContent = c.txt + " "; el.appendChild(sp); c.sp = sp; });
      caps.appendChild(el); capSpans.push({ el, ch });
    });
  });

  /* ───────── master timeline ───────── */
  const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
  const IN = (el, t, o = {}) => tl.fromTo(el, { opacity: 0, y: o.y ?? 28, x: o.x ?? 0 }, { opacity: 1, y: 0, x: 0, duration: o.d ?? 0.7, ease: o.ease || "power3.out" }, t);
  const OUT = (el, t, d = 0.45) => tl.to(el, { opacity: 0, duration: d, ease: "power1.in" }, t);
  const geoms = (sel) => $$(sel).flatMap((e) => (e.matches("path,rect,circle,ellipse,line") ? [e] : $$("path,rect,circle,ellipse,line", e)));
  const DRAW = (els, t, d = 1, stagger = 0) => {
    const arr = Array.isArray(els) ? els : [els];
    arr.forEach((e, i) => { const L = e.getTotalLength ? e.getTotalLength() : 600; e.style.strokeDasharray = L; tl.fromTo(e, { strokeDashoffset: L }, { strokeDashoffset: 0, duration: d, ease: "power2.inOut" }, t + i * stagger); });
  };
  const COUNT = (el, t, d, a, b, fmt) => { const o = { v: a }; tl.fromTo(o, { v: a }, { v: b, duration: d, ease: "power2.out", onUpdate: () => (el.textContent = fmt(o.v)) }, t); };

  // scene shells + wipes
  for (let i = 1; i <= 7; i++) {
    tl.fromTo("#s" + i, { opacity: 0 }, { opacity: 1, duration: 0.4 }, i === 1 ? 0.15 : ST(i) - 0.35);
    if (i < 7) tl.to("#s" + i, { opacity: 0, duration: 0.35 }, ST(i + 1) - 0.18);
    if (i > 1) tl.fromTo("#wipe", { left: -10, opacity: 1 }, { left: 1930, opacity: 1, duration: 0.95, ease: "power2.inOut" }, ST(i) - 0.7).set("#wipe", { opacity: 0 }, ST(i) + 0.3);
  }
  // background direction
  tl.fromTo(bg, { reveal: 0 }, { reveal: 1.1, duration: 3.6, ease: "power2.out" }, 0.3);
  tl.to(bg, { dim: 0.55, duration: 1.4, ease: "power1.inOut" }, ST(2) - 1);
  tl.to(bg, { dim: 0.42, duration: 1, ease: "none" }, ST(4) - 0.8);
  tl.to(bg, { dim: 0.4, duration: 1, ease: "none" }, ST(5) - 0.5);
  tl.to(bg, { dim: 1, pitch: -0.34, camH: 24, stars: 1, duration: 6.5, ease: "power2.inOut" }, ST(7) - 0.4);

  /* S1 — identity */
  const n1 = $$("#nm .nl:nth-child(1) span"), n2 = $$("#nm .nl:nth-child(2) span");
  tl.fromTo(n1, { yPercent: 118 }, { yPercent: 0, duration: 1.1, stagger: 0.045, ease: "expo.out" }, W(1, "Sarthak") - 0.25);
  tl.fromTo(n2, { yPercent: 118 }, { yPercent: 0, duration: 1.1, stagger: 0.05, ease: "expo.out" }, W(1, "Sahai") - 0.2);
  IN("#s1fig", 0.9, { d: 0.8 });
  tl.fromTo("#scanline", { top: 0, opacity: 0 }, { top: 650, opacity: 1, duration: 3.1, ease: "none" }, 1.2).to("#scanline", { opacity: 0, duration: 0.4 }, 4.3);
  tl.fromTo("#ph", { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 2.8, ease: "none" }, 2.0);
  tl.to("#pc", { opacity: 0, duration: 0.8 }, 4.5);
  IN("#s1sub", W(1, "engineering") - 0.2);
  IN("#s1hook", W(1, "measure") - 0.15, { y: 40, d: 0.9 });

  /* S2 — disciplines */
  const craftShapes = geoms("#bus, #panL, #panR, #dish, #thr, #pcb");
  tl.fromTo("#craft", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ST(2) - 0.1);
  DRAW(craftShapes.slice(0, 6), ST(2) + 0.1, 1.3, 0.05);
  DRAW(craftShapes.slice(6), ST(2) + 1.0, 1.4, 0.04);
  tl.fromTo("#code", { opacity: 0 }, { opacity: 1, duration: 0.6 }, W(2, "discipline"));
  tl.fromTo("#orbitG", { opacity: 0 }, { opacity: 1, duration: 0.8 }, W(2, "orbits") - 0.4);
  const ang = { a: 0 }; tl.fromTo(ang, { a: 0 }, { a: 6.283 * 2, duration: 13, ease: "none", onUpdate: () => { const s = $("#sat"); s.setAttribute("cx", 660 + 500 * Math.cos(ang.a)); s.setAttribute("cy", 520 + 150 * Math.sin(ang.a)); } }, ST(2));
  [["structures", "#l1", "#lk1", "#bus rect"], ["electronics", "#l2", "#lk2", "#pcb *"], ["software", "#l3", "#lk3", "#code"], ["orbits", "#l4", "#lk4", "#orbit"], ["operations", "#l5", "#lk5", "#dish path"]].forEach(([w, l, lk, hl]) => {
    const t = W(2, w); IN(l, t - 0.1, { x: l === "#l1" || l === "#l2" ? -30 : 30, y: 0, d: 0.6 }); DRAW($(lk), t, 0.8);
    const els = $$(hl), prop = hl === "#code" ? "fill" : "stroke";
    const base = hl === "#code" ? "rgba(236,231,219,.85)" : hl === "#orbit" ? "rgba(169,216,255,.55)" : "rgba(236,231,219,.75)";
    tl.to(els, { [prop]: "#ff5b2e", duration: 0.3 }, t).to(els, { [prop]: base, duration: 0.6 }, t + 1.3);
  });
  IN("#c1", W(2, "Cross-Disciplinary") - 0.15, { d: 0.7 });
  IN("#c2", W(2, "Entrepreneurship") - 0.15, { d: 0.7 });

  /* S3 — between */
  tl.fromTo(".vc", { attr: { r: 30 }, opacity: 0 }, { attr: { r: 250 }, opacity: 1, duration: 1.3, stagger: 0.12, ease: "power3.out" }, ST(3) - 0.1);
  tl.fromTo(".vt", { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: 0.1 }, ST(3) + 0.8);
  IN("#s3a", W(3, "answer") - 0.2, { d: 0.8 }); IN("#s3b", W(3, "between") - 0.25, { d: 0.8 });
  tl.fromTo("#vglow", { attr: { r: 10 }, opacity: 0 }, { attr: { r: 230 }, opacity: 1, duration: 1.2 }, W(3, "between") - 0.1);

  /* S4 — CSA */
  IN("#s4h", ST(4) + 0.15, { d: 0.9 });
  IN("#s4p", P1[0] - 0.8, { d: 0.8 });
  IN("#st1", W(4, "one") - 0.15); IN("#st2", W(4, "three") - 0.15); IN("#st3", W(4, "twenty") - 0.15);
  ["#ob1", "#ob2", "#ob3"].forEach((o, k) => { const r = ROCKS[k]; $(o).style.left = r.x - 18 + "px"; $(o).style.top = r.y - 40 + "px"; IN(o, W(4, "obstacles") - 0.2 + k * 0.25, { y: 6, d: 0.4 }); });
  IN("#trl", W(4, "supporting") - 0.1);
  const tbs = $$(".tb");
  tbs.forEach((b, i) => { if (i < 5) tl.fromTo(b, { background: "rgba(236,231,219,0)" }, { background: "rgba(236,231,219,.55)", duration: 0.25 }, W(4, "supporting") + 0.1 + i * 0.1); });
  tbs.slice(5, 7).forEach((b, i) => tl.fromTo(b, { background: "rgba(255,91,46,0)", borderColor: "rgba(236,231,219,.3)" }, { background: "#ff5b2e", borderColor: "#ff5b2e", duration: 0.3 }, W(4, "level") + i * 0.25));
  IN("#art", W(4, "Artemis") - 0.5);
  IN("#grid", W(4, "define") - 0.1);
  const hi = (ids, t, on = true) => tl.to(ids, { backgroundColor: on ? "#1d1410" : "#0b0d13", boxShadow: on ? "inset 0 0 0 1px #ff5b2e" : "inset 0 0 0 0 #ff5b2e", duration: 0.3 }, t);
  hi(["#gc00", "#gc01", "#hr0"], W(4, "25") - 0.05); hi(["#gc00", "#gc01", "#hr0"], W(4, "50") - 0.1, false);
  hi(["#gc10", "#gc11", "#hr1"], W(4, "50") - 0.05); hi(["#gc10", "#gc11", "#hr1"], W(4, "quarter") - 0.12, false);
  hi(["#gc00", "#gc10", "#hc0"], W(4, "quarter") - 0.05); hi(["#gc00", "#gc10", "#hc0"], W(4, "half") - 0.12, false);
  hi(["#gc01", "#gc11", "#hc1"], W(4, "half") - 0.05); hi(["#gc01", "#gc11", "#hc1"], W(4, "Building") - 0.3, false);
  IN("#flow", W(4, "Building") - 0.1, { d: 0.6 });
  tl.fromTo(["#flow > .mono:nth-of-type(1)", "#f1", "#f2", "#f3"], { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.45, stagger: 0.28 }, W(4, "chain") - 0.2);
  tl.fromTo("#inh", { opacity: 0 }, { opacity: 1, duration: 0.5 }, W(4, "external") + 0.3);

  /* S5 — leadership */
  IN("#s5h", ST(5) + 0.1);
  IN("#r1", W(5, "president") - 0.25, { d: 0.8 });
  DRAW($("#truss path"), W(5, "Steel") - 0.1, 1.4);
  COUNT($("#tm"), W(5, "six") - 0.1, 0.9, 6, 20, (v) => Math.round(v));
  COUNT($("#fund"), W(5, "thirtyfive") - 0.1, 1.5, 0, 35000, (v) => "$" + Math.round(v).toLocaleString("en-US"));
  IN("#r2", W(5, "steering") - 0.25, { d: 0.8 });
  const tb = { p: 0 }; tl.fromTo(tb, { p: 0 }, { p: 1, duration: 3.4, ease: "power1.in", onUpdate: () => { const x = 40 + tb.p * 410, y = 40 + (x / 488) * 100; $("#tob").setAttribute("transform", `translate(${x} ${y - 12}) rotate(11.6)`); } }, W(5, "toboggan") - 0.6);
  tl.fromTo("#aw1", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, W(5, "Best") - 0.1);
  tl.fromTo("#aw2", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, W(5, "Best", 1) - 0.1);
  tl.fromTo("#aw3", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, W(5, "Design") + 0.35);
  IN("#r3", W(5, "VP") - 0.2, { d: 0.8 });
  tl.fromTo("#net .nd", { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.08 }, W(5, "Student") - 0.1);
  DRAW($$("#net .nl"), W(5, "Student"), 0.8, 0.04);

  /* S6 — projects */
  IN("#s6h", ST(6) + 0.1);
  IN("#p1", W(6, "NOVA") - 0.3, { d: 0.8 });
  const bl = { p: 0 }; tl.fromTo(bl, { p: 0 }, { p: 1, duration: 1.9, ease: "power2.inOut", onUpdate: () => $("#bal").setAttribute("transform", `translate(120 ${230 - bl.p * 190}) scale(${0.8 + bl.p * 0.5})`) }, W(6, "flown") - 0.2);
  IN("#p2", W(6, "ROUTEM") - 0.3, { d: 0.8 });
  IN("#p3", W(6, "OSCAR") - 0.3, { d: 0.8 });
  DRAW($("#spec"), W(6, "ocean-health") - 0.2, 1.4);
  IN("#p4", W(6, "Now") - 0.1, { d: 0.8 });
  const mast = $("#mast"); [[W(6, "rover") - 0.1, 110, 150], [W(6, "platform") - 0.1, 44, 163], [W(6, "targeting") + 0.1, 60, 140]].forEach(([t, w, x]) => tl.to(mast, { attr: { width: w, x }, duration: 0.5, ease: "back.out(2)" }, t));

  /* S7 — next */
  const l7 = [["Mapping", "new worlds", "mapping"], ["Protecting", "ours", "protecting"], ["Opening", "new science & industries", "opening"]];
  const host = $("#s7"); const list = document.createElement("div"); list.className = "abs"; list.style.cssText = "left:0;right:0;top:300px;text-align:center"; host.appendChild(list);
  l7.forEach(([a, b, key], i) => { const d = document.createElement("div"); d.className = "disp"; d.style.cssText = "font-size:104px;line-height:1.08;opacity:0"; d.innerHTML = `<span class="laser" style="font-family:'Fragment Mono';font-size:26px;letter-spacing:.14em;vertical-align:middle;margin-right:26px">0${i + 1}</span>${a} <span class="ser">${b}</span>`; list.appendChild(d); IN(d, W(7, key) - 0.2, { d: 0.7 }); });
  IN("#s7a", W(7, "Lets") - 0.3, { d: 1.0, y: 36 });
  tl.to(list, { opacity: 0, duration: 0.5 }, W(7, "Lets") - 0.5);
  IN("#s7c", W(7, "build") + 0.8, { d: 0.8 });
  tl.fromTo(blk, { opacity: 0 }, { opacity: 1, duration: 1.1, ease: "power1.inOut" }, D - 1.1);

  // captions
  capSpans.forEach(({ el, ch }, k) => {
    const a = ch[0].w.t, b = ch[ch.length - 1].w.t + ch[ch.length - 1].w.d;
    const nx = capSpans[k + 1] ? capSpans[k + 1].ch[0].w.t : 1e9;
    const hideAt = Math.min(b + 0.12, nx - 0.3);
    tl.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.2 }, a - 0.08);
    tl.to(el, { opacity: 0, duration: 0.18 }, Math.max(a + 0.3, hideAt));
    ch.forEach((c) => tl.fromTo(c.sp, { color: "rgba(236,231,219,.38)" }, { color: "#ece7db", duration: 0.12 }, c.w.t));
  });
  tl.set({}, {}, D); // pad timeline to D

  /* ───────── per-frame render ───────── */
  const TAGS = ["Identity", "Disciplines", "Method", "Canadian Space Agency", "Leadership", "Projects", "Next"];
  let lastTag = -1;
  const tcEl = $("#tc"), prog = $("#prog b"), tagn = $("#tagn"), tagl = $("#tagl"), cfg = $("#swcfg"), km = $("#km");
  function frame(t) {
    drawBG(t);
    drawPortrait(clamp((t - 1.2) / 2.9));
    if (t > 32 && t < 60) { drawSwath(t); const c = t < P2[0] - 0.4 ? "25 Hz · 0.5°" : "50 Hz · 0.25°"; if (cfg.textContent !== c) cfg.textContent = c; }
    if (t > 80 && t < 94) drawGlobe(t);
    let si = 0; for (let i = 1; i <= 7; i++) if (t >= ST(i) - 0.2) si = i - 1;
    if (si !== lastTag) { lastTag = si; tagn.textContent = String(si + 1).padStart(2, "0"); tagl.textContent = TAGS[si]; }
    tcEl.textContent = mmss(t) + " / " + mmss(D);
    prog.style.transform = `scaleX(${clamp(t / D)})`;
  }

  let cur = 0;
  window.seek = (t) => { cur = clamp(t, 0, D); tl.time(cur, false); frame(cur); };
  const kmo = { v: 0 }; tl.fromTo(kmo, { v: 0 }, { v: 40, duration: 1, ease: "power2.out", onUpdate: () => { $("#km").innerHTML = `${Math.round(kmo.v)}<u>km</u>`; } }, W(6, "forty") - 0.2);

  /* ───────── player ───────── */
  const aud = $("#aud"), pp = $("#pp"), scrub = $("#scrub"), ct = $("#ct"), dt = $("#dt");
  dt.textContent = mmss(D);
  let playing = false, endMark = 0;
  function loop() {
    requestAnimationFrame(loop);
    if (!playing) return;
    let t;
    if (!aud.ended && aud.currentTime < T.total - 0.02) t = aud.currentTime;
    else { if (!endMark) endMark = performance.now(); t = Math.max(aud.currentTime, T.total) + (performance.now() - endMark) / 1000; }
    if (t >= D) { playing = false; pp.textContent = "Replay"; t = D; }
    window.seek(t); scrub.value = (t / D) * 1000; ct.textContent = mmss(t);
  }
  function play() { if (cur >= D - 0.05) { cur = 0; aud.currentTime = 0; } endMark = 0; if (cur < T.total) aud.currentTime = cur; aud.play().catch(() => {}); playing = true; pp.textContent = "Pause"; $("#start").style.display = "none"; }
  function pause() { aud.pause(); playing = false; pp.textContent = "Play"; }
  pp.onclick = () => (playing ? pause() : play());
  $("#start").onclick = play;
  scrub.oninput = () => { const t = (scrub.value / 1000) * D; if (t < T.total) aud.currentTime = t; endMark = 0; window.seek(t); ct.textContent = mmss(t); };
  addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); playing ? pause() : play(); }
    if (e.code === "ArrowRight") { const t = Math.min(D, cur + 5); if (t < T.total) aud.currentTime = t; window.seek(t); }
    if (e.code === "ArrowLeft") { const t = Math.max(0, cur - 5); aud.currentTime = t; endMark = 0; window.seek(t); }
  });

  /* ───────── boot ───────── */
  Promise.all([document.fonts.ready, ph.decode().catch(() => {})]).then(() => {
    prepPortrait();
    window.seek(parseFloat(q.get("t") || "0"));
    window.READY = true;
    loop();
  });
  window.DURATION = D;
})();
