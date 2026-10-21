import * as THREE from "three";

/* ─────────────────────────────────────────────────────────────────────────
   THE LIMB — the edge of a planet far below. As the camera climbs, the ground falls away and the horizon sinks toward
   the bottom of the frame, a thin line of air glowing along it, the way it does from a balloon at 40 km. Drawn on a
   dome around the camera by ray-marching nothing: each pixel asks only how close its ray comes to a big sphere.
   ───────────────────────────────────────────────────────────────────────── */

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uCam, uCenter;
  uniform float uR, uGain, uTime;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec3 ro = uCam - uCenter;
    float b = dot(ro, d);
    float c = dot(ro, ro) - uR * uR;
    float disc = b * b - c;
    float a = 0.0;
    vec3 col = vec3(0.35, 0.66, 1.0);
    if (disc > 0.0 && b < 0.0) {
      // the ray meets the surface: dark ground, lit only toward the edge
      float t = -b - sqrt(disc);
      vec3 n = normalize(ro + d * t);
      float mu = clamp(dot(n, -d), 0.0, 1.0);
      float rim = pow(1.0 - mu, 5.0);
      a = 0.035 + 0.5 * rim;
      col = mix(vec3(0.16, 0.34, 0.62), vec3(0.6, 0.85, 1.0), rim);
    } else if (b < 0.0) {
      // it passes above: air, thickest where it skims the surface
      float alt = length(ro + d * (-b)) - uR;
      float g = exp(-alt / 85.0);
      a = g * 0.85;
      col = mix(vec3(0.3, 0.6, 1.0), vec3(1.0, 0.82, 0.62), exp(-alt / 22.0) * 0.35);
    }
    a *= uGain;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

export type Limb = {
  mesh: THREE.Mesh;
  setGain(v: number): void;
  /** Place it around the camera (the planet itself stays where it is). */
  update(camera: THREE.Vector3, t: number): void;
  dispose(): void;
};

/** A planet of `radius` metres whose surface passes through (x, groundY, z). */
export function createLimb(radius: number, x: number, groundY: number, z: number): Limb {
  const uniforms = {
    uCam: { value: new THREE.Vector3() },
    uCenter: { value: new THREE.Vector3(x, groundY - radius, z) },
    uR: { value: radius },
    uGain: { value: 0 },
    uTime: { value: 0 },
  };
  const geo = new THREE.SphereGeometry(900, 40, 20);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    side: THREE.BackSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -3;
  mesh.visible = false;
  return {
    mesh,
    setGain(v) {
      uniforms.uGain.value = v;
      mesh.visible = v > 0.003;
    },
    update(camera, t) {
      mesh.position.copy(camera);
      uniforms.uCam.value.copy(camera);
      uniforms.uTime.value = t;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
