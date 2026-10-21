import * as THREE from "three";
import { raycast, type Hit } from "@/lib/terrain";
import { lerp } from "@/lib/math";
import { BETA, FAN_FRAG, FAN_VERT } from "@/components/hero/terrainScene";

/* ─────────────────────────────────────────────────────────────────────────
   SCAN — the pushbroom's visible side: a fan of laser from the sensor head to the ground, beams along it, and a
   glow at the emitter. Hits are real ray casts against the terrain. Shared by the traverse section and the world.
   ───────────────────────────────────────────────────────────────────────── */

const FAN_I = 0.16;
const BEAM_I = 0.38;

export type Scan = {
  group: THREE.Group;
  /** Recompute the fan from `head`, travelling along `heading` (radians, 0 = +z), over ground at about `groundY`. */
  update(head: THREE.Vector3, heading: number, groundY: number): void;
  /** Brightness (0 = off). */
  setGain(g: number, glowPx: number): void;
  dispose(): void;
};

export function createScan(opts: { lowPower: boolean }): Scan {
  const FAN_N = opts.lowPower ? 40 : 64;
  const BEAMS = opts.lowPower ? 20 : 36;
  const group = new THREE.Group();
  const laser = new THREE.Color(1.0, 0.36, 0.18);

  const fanPos = new Float32Array((FAN_N + 1) * 3);
  const fanAlpha = new Float32Array(FAN_N + 1).fill(1);
  fanAlpha[0] = 0;
  const fanIdx: number[] = [];
  for (let k = 1; k < FAN_N; k++) fanIdx.push(0, k, k + 1);
  const fanGeo = new THREE.BufferGeometry();
  fanGeo.setAttribute("position", new THREE.BufferAttribute(fanPos, 3).setUsage(THREE.DynamicDrawUsage));
  fanGeo.setAttribute("aAlpha", new THREE.BufferAttribute(fanAlpha, 1));
  fanGeo.setIndex(fanIdx);
  const fanMat = new THREE.ShaderMaterial({
    vertexShader: FAN_VERT, fragmentShader: FAN_FRAG,
    uniforms: { uColor: { value: laser }, uIntensity: { value: 0 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.frustumCulled = false;
  fan.renderOrder = 1;
  group.add(fan);

  const beamPos = new Float32Array(BEAMS * 2 * 3);
  const beamAlpha = new Float32Array(BEAMS * 2);
  for (let i = 0; i < BEAMS; i++) beamAlpha[i * 2 + 1] = 1;
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute("position", new THREE.BufferAttribute(beamPos, 3).setUsage(THREE.DynamicDrawUsage));
  beamGeo.setAttribute("aAlpha", new THREE.BufferAttribute(beamAlpha, 1));
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: FAN_VERT, fragmentShader: FAN_FRAG,
    uniforms: { uColor: { value: laser }, uIntensity: { value: 0 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const beams = new THREE.LineSegments(beamGeo, beamMat);
  beams.frustumCulled = false;
  beams.renderOrder = 1;
  group.add(beams);

  const emitter = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3)),
    new THREE.ShaderMaterial({
      vertexShader: `uniform float uSize; void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize = uSize; }`,
      fragmentShader: `void main(){ float d = length(gl_PointCoord-0.5)*2.0; float a = pow(smoothstep(1.0,0.0,d),2.2); gl_FragColor = vec4(1.0,0.5,0.3,a*0.9); }`,
      uniforms: { uSize: { value: 0 } },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  emitter.frustumCulled = false;
  emitter.renderOrder = 15;
  group.add(emitter);

  const hit: Hit = { t: 0, x: 0, y: 0, z: 0 };
  let gain = 0;

  return {
    group,
    update(head, heading, groundY) {
      if (gain < 0.01) return;
      const fwdX = Math.sin(heading), fwdZ = Math.cos(heading);
      const rx = fwdZ, rz = -fwdX;
      const ux = fwdX * Math.cos(BETA), uy = -Math.sin(BETA), uz = fwdZ * Math.cos(BETA);
      const half = 1.0; // ±57°
      fanPos[0] = head.x; fanPos[1] = head.y; fanPos[2] = head.z;
      let beamI = 0;
      const beamStep = Math.max(1, Math.floor(FAN_N / BEAMS));
      for (let k = 0; k < FAN_N; k++) {
        const phi = lerp(-half, half, k / (FAN_N - 1));
        const c = Math.cos(phi), s = Math.sin(phi);
        const dx = ux * c + rx * s, dy = uy * c, dz = uz * c + rz * s;
        const est = (head.y - groundY) / Math.max(0.02, -dy);
        const h = raycast(head.x, head.y, head.z, dx, dy, dz, Math.max(0.5, est * 0.5), est * 1.7 + 6, hit);
        let hx: number, hy: number, hz: number;
        if (h) { hx = h.x; hy = h.y + 0.03; hz = h.z; }
        else { const t = Math.min(est, 60); hx = head.x + dx * t; hy = head.y + dy * t; hz = head.z + dz * t; }
        const o = (k + 1) * 3;
        fanPos[o] = hx; fanPos[o + 1] = hy; fanPos[o + 2] = hz;
        if (k % beamStep === 0 && beamI < BEAMS) {
          const b = beamI * 6;
          beamPos[b] = head.x; beamPos[b + 1] = head.y; beamPos[b + 2] = head.z;
          beamPos[b + 3] = hx; beamPos[b + 4] = hy; beamPos[b + 5] = hz;
          beamI++;
        }
      }
      (fanGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      (beamGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      emitter.position.copy(head);
    },
    setGain(g, glowPx) {
      gain = g;
      group.visible = g > 0.01;
      fanMat.uniforms.uIntensity.value = FAN_I * g;
      beamMat.uniforms.uIntensity.value = BEAM_I * g;
      (emitter.material as THREE.ShaderMaterial).uniforms.uSize.value = glowPx * g;
    },
    dispose() {
      fanGeo.dispose(); fanMat.dispose(); beamGeo.dispose(); beamMat.dispose();
      emitter.geometry.dispose(); (emitter.material as THREE.Material).dispose();
    },
  };
}
