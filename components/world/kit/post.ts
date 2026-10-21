import * as THREE from "three";

/* ─────────────────────────────────────────────────────────────────────────
   POST — the scene is drawn into a target and composited with:
     · a soft bloom, so the additive points and vermilion edges glow
     · chromatic aberration that grows with the scroll speed and at a gate
     · "tech displacement": bands of the image tear sideways during a gate pulse
     · a warm grade for dawn, and a vignette
   Off on low-power devices (the scene is drawn straight to the canvas).
   ───────────────────────────────────────────────────────────────────────── */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uTexel;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tScene, vUv + uTexel * vec2(-1.0, -1.0)).rgb
           + texture2D(tScene, vUv + uTexel * vec2( 1.0, -1.0)).rgb
           + texture2D(tScene, vUv + uTexel * vec2(-1.0,  1.0)).rgb
           + texture2D(tScene, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
    c *= 0.25;
    gl_FragColor = vec4(max(c - uThreshold, 0.0), 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
    c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
    c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const COMP_FRAG = /* glsl */ `
  uniform sampler2D tScene, tBloom;
  uniform float uTime, uPulse, uCA, uVel, uBloom, uVignette, uWarm, uFade;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 uv = vUv;
    float k = uPulse * uPulse;

    // tech displacement: horizontal bands tear sideways during a pulse
    float band = floor(uv.y * 34.0);
    float tear = hash(vec2(band, floor(uTime * 16.0))) - 0.5;
    uv.x += tear * 0.05 * k;
    uv = (uv - 0.5) * (1.0 - 0.07 * uPulse) + 0.5;   // a small push-in

    // chromatic aberration, stronger toward the edges
    vec2 d = uv - 0.5;
    float ca = (uCA + uPulse * 0.014 + uVel * 0.008) * (0.25 + dot(d, d) * 3.2);
    vec3 col;
    col.r = texture2D(tScene, uv + d * ca).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv - d * ca).b;

    col += texture2D(tBloom, uv).rgb * uBloom;
    col += vec3(1.0, 0.36, 0.18) * uPulse * 0.2 * max(0.0, 1.0 - length(d) * 1.3);   // a vermilion lift at the gate

    // dawn: warm and a touch lifted
    col = mix(col, col * vec3(1.16, 0.96, 0.8) + vec3(0.018, 0.008, 0.0), uWarm);

    float v = smoothstep(1.0, 0.28, length(vUv - 0.5) * 1.15);
    col *= mix(1.0, v, uVignette);
    col *= uFade;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export type Post = {
  enabled: boolean;
  /** Per-frame values (all 0 = a plain image). */
  uniforms: {
    uTime: THREE.IUniform<number>;
    uPulse: THREE.IUniform<number>;
    uCA: THREE.IUniform<number>;
    uVel: THREE.IUniform<number>;
    uBloom: THREE.IUniform<number>;
    uVignette: THREE.IUniform<number>;
    uWarm: THREE.IUniform<number>;
    uFade: THREE.IUniform<number>;
  };
  resize(): void;
  /** Draw the scene with `draw` (into the target) and composite it to the canvas. */
  render(draw: () => void): void;
  dispose(): void;
};

export function createPost(renderer: THREE.WebGLRenderer, opts: { lowPower: boolean }): Post {
  const uniforms = {
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uCA: { value: 0.0025 },
    uVel: { value: 0 },
    uBloom: { value: 0.85 },
    uVignette: { value: 0.9 },
    uWarm: { value: 0 },
    uFade: { value: 1 },
  };
  if (opts.lowPower) {
    uniforms.uBloom.value = 0;
    return {
      enabled: false,
      uniforms,
      resize() {},
      render(draw) {
        draw();
      },
      dispose() {},
    };
  }

  const floatOk = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
  const type = floatOk ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const make = (w: number, h: number) => new THREE.WebGLRenderTarget(w, h, { type, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  let rtScene = make(2, 2);
  let rtA = make(2, 2);
  let rtB = make(2, 2);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mk = (frag: string, u: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: u, depthTest: false, depthWrite: false });
  const brightMat = mk(BRIGHT_FRAG, { tScene: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.5 } });
  const blurMat = mk(BLUR_FRAG, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const compMat = mk(COMP_FRAG, { tScene: { value: null }, tBloom: { value: null }, ...uniforms });
  const mesh = new THREE.Mesh(geo, brightMat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);

  const size = new THREE.Vector2();
  const pass = (mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
    mesh.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
  };

  return {
    enabled: true,
    uniforms,
    resize() {
      renderer.getDrawingBufferSize(size);
      const w = Math.max(2, Math.floor(size.x)), h = Math.max(2, Math.floor(size.y));
      rtScene.setSize(w, h);
      const bw = Math.max(2, Math.floor(w / 4)), bh = Math.max(2, Math.floor(h / 4));
      rtA.setSize(bw, bh);
      rtB.setSize(bw, bh);
      brightMat.uniforms.uTexel.value.set(0.5 / w, 0.5 / h);
    },
    render(draw) {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rtScene);
      renderer.clear();
      draw();
      // bright pass → blur (horizontal, vertical) at a quarter of the resolution
      brightMat.uniforms.tScene.value = rtScene.texture;
      pass(brightMat, rtA);
      blurMat.uniforms.tSrc.value = rtA.texture;
      blurMat.uniforms.uDir.value.set(1 / rtA.width, 0);
      pass(blurMat, rtB);
      blurMat.uniforms.tSrc.value = rtB.texture;
      blurMat.uniforms.uDir.value.set(0, 1 / rtA.height);
      pass(blurMat, rtA);
      blurMat.uniforms.tSrc.value = rtA.texture;
      blurMat.uniforms.uDir.value.set(2 / rtA.width, 0);
      pass(blurMat, rtB);
      blurMat.uniforms.tSrc.value = rtB.texture;
      blurMat.uniforms.uDir.value.set(0, 2 / rtA.height);
      pass(blurMat, rtA);
      compMat.uniforms.tScene.value = rtScene.texture;
      compMat.uniforms.tBloom.value = rtA.texture;
      pass(compMat, prev);
    },
    dispose() {
      rtScene.dispose();
      rtA.dispose();
      rtB.dispose();
      geo.dispose();
      brightMat.dispose();
      blurMat.dispose();
      compMat.dispose();
    },
  };
}
