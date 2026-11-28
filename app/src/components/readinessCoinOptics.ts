import * as THREE from "three";

type Point2 = [number, number];
type Point3 = [number, number, number];
type CoinRing = { r: number | "ridge"; z: number; type: string };

export const COIN_CONFIG = {
  outerRadius: 2.0,
  ridgeCount: 120,
  ridgeDepth: 0.062,          // Physical depth of each vertical flute
  innerFieldRadius: 1.54,     // Flat crystal optical field radius
  innerHalfDepth: 0.128,      // Half-thickness at flat recessed center
  rimCrownHalfDepth: 0.214,   // Half-thickness at highest rim crown
  edgeHalfDepth: 0.156,       // Half-thickness where vertical flutes span
  logoMaxRadius: 1.12,        // Max fit radius for the centered emblem
  logoBaseZ: 0.129            // Flush mount Z-offset on both inner faces
};

export function createStudioEnvironment(renderer: THREE.WebGLRenderer) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x06080d);

  const disposables: { dispose(): void }[] = [];
  const addPanel = (width: number, height: number, colorRGB: Point3, pos: Point3, lookAt: Point3 = [0, 0, 0]) => {
    const geo = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(colorRGB[0], colorRGB[1], colorRGB[2]),
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    envScene.add(mesh);
    disposables.push(geo, mat);
  };

  // Primary overhead key softbox (wide crisp gallery reflection)
  addPanel(18, 6.5, [6.5, 6.8, 7.4], [0, 11, 5.5], [0, 0, 0]);

  // Sharp vertical studio strip lights (creates razor-clean rim & flute highlights)
  addPanel(2.0, 20, [9.5, 9.7, 10.2], [11.5, 1.5, 4.5], [0, 0, 0]);
  addPanel(1.8, 19, [8.5, 9.0, 10.0], [-11.5, 1.0, 5.0], [0, 0, 0]);

  // Pure black negative-fill cards beside strip lights for dark crystal Fresnel edges
  addPanel(3.5, 22, [0.0, 0.0, 0.0], [11.0, 0, 0.5], [0, 0, 0]);
  addPanel(3.5, 22, [0.0, 0.0, 0.0], [-11.0, 0, 0.5], [0, 0, 0]);

  // Rear-top rim kicker strip (illuminates edge flutes & back bevels)
  addPanel(16, 2.8, [7.8, 8.2, 9.0], [0, 9.5, -10.0], [0, 0, 0]);
  addPanel(2.2, 16, [5.5, 6.2, 7.5], [9.5, -1.0, -9.0], [0, 0, 0]);
  addPanel(2.2, 16, [6.0, 5.6, 6.8], [-9.5, -1.0, -9.0], [0, 0, 0]);

  // Subtle prismatic accent strips for internal crystal scintillation
  addPanel(3.2, 11, [0.9, 3.6, 5.2], [-10.0, 5.5, -4.0], [0, 0, 0]);
  addPanel(3.2, 11, [5.0, 1.8, 3.6], [10.0, -4.5, -3.5], [0, 0, 0]);

  // Soft lower fill bounce so bottom bevels stay sculpted
  addPanel(16, 12, [1.8, 2.0, 2.5], [0, -11.5, 2.0], [0, 0, 0]);

  // Front subtle catch-light bar (keeps embossed logo edges lively)
  addPanel(8.0, 1.6, [4.2, 4.4, 4.8], [3.5, 5.2, 12.0], [0, 0, 0]);

  try {
    return pmremGenerator.fromScene(envScene, 0.032);
  } finally {
    disposables.forEach((item) => item.dispose());
    pmremGenerator.dispose();
  }
}

export function createRefractionBackdrop() {
  const uniforms = { uTime: { value: 0 }, uRefractionPass: { value: false } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform bool uRefractionPass;
      varying vec3 vWorldDir;

      vec3 evalEmerald(vec3 dir) {
        float az = atan(dir.x, -dir.z);
        float el = asin(clamp(dir.y, -1.0, 1.0));
        vec2 uv = vec2(az, el);

        float t = uTime * 0.26;
        float flowA = sin(uv.y * 5.8 + sin(uv.x * 2.2 + t) * 1.1 + uv.x * 1.2);
        float flowB = cos(uv.x * 3.4 + uv.y * 4.2 - t * 0.75 + sin(uv.y * 3.0 + t) * 0.8);

        float ribbon = smoothstep(-0.15, 0.75, flowA);
        float shadow = pow(smoothstep(0.15, 0.95, 0.5 - 0.5 * flowB), 2.0);
        float silk = pow(smoothstep(0.35, 0.98, 0.5 + 0.5 * sin(uv.y * 4.5 - uv.x * 2.0 + t * 0.5)), 2.2);
        float accent = pow(max(0.0, flowA * flowB), 2.0);
        float beam = pow(abs(sin(uv.x * 2.0 + uv.y * 3.2 - t * 0.35)), 1.5);

        if (uRefractionPass) {
          vec3 alabaster = vec3(0.76, 0.84, 0.86);
          vec3 emerald = vec3(0.02, 0.86, 0.58);
          vec3 aqua = vec3(0.08, 0.96, 0.88);
          vec3 jade = vec3(0.015, 0.14, 0.14);
          vec3 optical = mix(jade, alabaster, 0.52 + 0.35 * silk);
          optical = mix(optical, emerald, ribbon * 0.62);
          optical += aqua * accent * 0.65;
          optical = mix(optical, jade * 0.7, shadow * 0.72);
          return optical + vec3(1.15, 1.22, 1.20) * exp(-beam * 18.0) * 0.58;
        }

        vec3 porcelain = vec3(0.97, 0.98, 0.94);
        vec3 sage      = vec3(0.66, 0.78, 0.57);
        vec3 leaf      = vec3(0.52, 0.72, 0.35);
        vec3 paleLeaf  = vec3(0.78, 0.89, 0.67);

        vec3 col = mix(sage, porcelain, 0.68 + 0.27 * silk);
        col = mix(col, leaf, ribbon * 0.48);
        col = mix(col, paleLeaf, accent * 0.24);
        col = mix(col, sage, shadow * 0.44);
        col = mix(col, porcelain, exp(-beam * 9.0) * 0.22);
        return col;
      }

      void main() {
        vec3 wash = evalEmerald(normalize(vWorldDir));
        float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        gl_FragColor = vec4(wash + (uRefractionPass ? 0.0 : (grain - 0.5) * 0.022), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(42, 64, 48), material);
  // Preserve the established crystal contrast when Three renders the transmission texture.
  mesh.onBeforeRender = (renderer) => {
    uniforms.uRefractionPass.value = renderer.getRenderTarget() !== null;
    material.uniformsNeedUpdate = true;
  };
  return { mesh, uniforms };
}

export function createCrystalCoinGeometry(cfg = COIN_CONFIG) {
  const N = cfg.ridgeCount;           // 120 reeded ridges
  const SUBS = 4;                     // 4 angular corners per trapezoidal ridge
  const SEG = N * SUBS;               // 480 circumferential vertices per ring

  const rOut = cfg.outerRadius;
  const rIn = rOut - cfg.ridgeDepth;

  // Precompute circumferential angles and ridge radii for one full revolution
  // Each ridge period [0..1):
  //   0.00 -> 0.30 : groove floor (rIn)
  //   0.30 -> 0.44 : rising flank (rIn -> rOut)
  //   0.44 -> 0.86 : ridge crest  (rOut)
  //   0.86 -> 1.00 : falling flank (rOut -> rIn)
  const phaseOffsets = [0.0, 0.30, 0.44, 0.86];
  const phaseRadii   = [rIn, rIn,  rOut, rOut];

  const cosT = new Float64Array(SEG);
  const sinT = new Float64Array(SEG);
  const ridgeR = new Float64Array(SEG);

  for (let i = 0; i < N; i++) {
    for (let s = 0; s < SUBS; s++) {
      const idx = i * SUBS + s;
      const t = ((i + phaseOffsets[s]) / N) * Math.PI * 2;
      cosT[idx] = Math.cos(t);
      sinT[idx] = Math.sin(t);
      ridgeR[idx] = phaseRadii[s];
    }
  }

  // Define radial cross-section rings for the FRONT (+Z) half.
  // Each ring: { r (or 'ridge'), z, smoothWithPrev, smoothWithNext, fixedNormalZ? }
  const rInner = cfg.innerFieldRadius; // 1.54
  const zInner = cfg.innerHalfDepth;   // 0.128
  const zCrown = cfg.rimCrownHalfDepth;// 0.214
  const zEdge  = cfg.edgeHalfDepth;    // 0.156

  // Radial profile from center (r=0) out to reeded edge top (z = +zEdge)
  const frontRings: CoinRing[] = [
    // 0: Flat inner crystal field outer edge
    { r: rInner,        z: zInner,        type: 'flatFace' },
    // 1: Crisp inner jewel facet 1 (steep bevel catching bright concentric ring)
    { r: rInner + 0.065, z: zInner + 0.044, type: 'facet' },
    // 2: Secondary micro optical facet rising into raised rim
    { r: rInner + 0.125, z: zCrown - 0.016, type: 'facet' },
    // 3..7: Smoothly crowned raised outer rim (5 smooth rings for silky specular glide)
    { r: rInner + 0.165, z: zCrown - 0.005, type: 'smooth' },
    { r: rInner + 0.215, z: zCrown,         type: 'smooth' },
    { r: rInner + 0.270, z: zCrown - 0.003, type: 'smooth' },
    { r: rInner + 0.320, z: zCrown - 0.014, type: 'smooth' },
    { r: rIn - 0.028,    z: zCrown - 0.032, type: 'smooth' },
    // 8: Crisp chamfer lip transitioning toward flutes
    { r: rIn - 0.002,    z: zEdge + 0.018,  type: 'facet' },
    // 9: Scalloped tooth shoulder meeting top of the 120 vertical flutes
    { r: 'ridge',        z: zEdge,          type: 'ridgeTop' }
  ];

  // Mirror the front profile to construct the BACK (-Z) half cleanly
  const backRings: CoinRing[] = [];
  for (let i = frontRings.length - 1; i >= 0; i--) {
    const fr = frontRings[i];
    backRings.push({
      r: fr.r,
      z: -fr.z,
      type: fr.type === 'ridgeTop' ? 'ridgeBottom' : fr.type
    });
  }

  // Full continuous profile from front center edge -> front rim -> edge -> back rim -> back center edge
  const profile = [...frontRings, ...backRings];

  // Output dynamic arrays for clean non-indexed BufferGeometry
  // (Allows mixing exact flat facet normals and analytical smooth normals with zero seam cracks)
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const vD = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const fNorm = new THREE.Vector3();

  function ringPoint(ring: CoinRing, k: number, target: THREE.Vector3) {
    const rad = ring.r === 'ridge' ? ridgeR[k] : ring.r;
    target.set(rad * cosT[k], rad * sinT[k], ring.z);
    return target;
  }

  function pushVertex(v: THREE.Vector3, n: THREE.Vector3, u: number, w: number) {
    positions.push(v.x, v.y, v.z);
    normals.push(n.x, n.y, n.z);
    uvs.push(u, w);
  }

  // Push a flat-shaded triangle with exact outward face normal
  function pushFlatTri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, uvA: Point2, uvB: Point2, uvC: Point2) {
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    fNorm.crossVectors(e1, e2).normalize();
    pushVertex(a, fNorm, uvA[0], uvA[1]);
    pushVertex(b, fNorm, uvB[0], uvB[1]);
    pushVertex(c, fNorm, uvC[0], uvC[1]);
  }

  // 1. FRONT FLAT CENTER DISK (z = +zInner, exact +Z normals)
  const frontCenter = new THREE.Vector3(0, 0, zInner);
  const normPlusZ = new THREE.Vector3(0, 0, 1);
  for (let k = 0; k < SEG; k++) {
    const kNext = (k + 1) % SEG;
    ringPoint(frontRings[0], k, vA);
    ringPoint(frontRings[0], kNext, vB);

    pushVertex(frontCenter, normPlusZ, 0.5, 0.5);
    pushVertex(vA, normPlusZ, vA.x / (2 * rOut) + 0.5, vA.y / (2 * rOut) + 0.5);
    pushVertex(vB, normPlusZ, vB.x / (2 * rOut) + 0.5, vB.y / (2 * rOut) + 0.5);
  }

  // 2. BACK FLAT CENTER DISK (z = -zInner, exact -Z normals)
  const backCenter = new THREE.Vector3(0, 0, -zInner);
  const normMinusZ = new THREE.Vector3(0, 0, -1);
  const lastRing = profile[profile.length - 1];
  for (let k = 0; k < SEG; k++) {
    const kNext = (k + 1) % SEG;
    ringPoint(lastRing, k, vA);
    ringPoint(lastRing, kNext, vB);

    // Reversed order so normal points -Z
    pushVertex(backCenter, normMinusZ, 0.5, 0.5);
    pushVertex(vB, normMinusZ, vB.x / (2 * rOut) + 0.5, vB.y / (2 * rOut) + 0.5);
    pushVertex(vA, normMinusZ, vA.x / (2 * rOut) + 0.5, vA.y / (2 * rOut) + 0.5);
  }

  // Precompute smooth radial profile normals for the smooth crown bands
  function computeSmoothRingNormal(pIdx: number, k: number, target: THREE.Vector3) {
    const prev = profile[Math.max(0, pIdx - 1)];
    const next = profile[Math.min(profile.length - 1, pIdx + 1)];

    const rPrev = prev.r === 'ridge' ? ridgeR[k] : prev.r;
    const rNext = next.r === 'ridge' ? ridgeR[k] : next.r;
    const dr = rNext - rPrev;
    const dz = next.z - prev.z;

    // Tangent along profile in (r, z) plane is (dr, dz).
    // Outward normal in (r, z) plane for front->edge->back traversal is (-dz, dr)
    let nr = -dz;
    let nz = dr;
    const len = Math.hypot(nr, nz) || 1;
    nr /= len;
    nz /= len;

    target.set(nr * cosT[k], nr * sinT[k], nz).normalize();
    return target;
  }

  const nA = new THREE.Vector3();
  const nB = new THREE.Vector3();
  const nC = new THREE.Vector3();
  const nD = new THREE.Vector3();

  // 3. PROFILE STRIPS (Front bevels -> smooth crown -> scalloped chamfer ->
  //                    120 vertical reeded flutes -> back scalloped chamfer -> back crown -> back bevels)
  for (let p = 0; p < profile.length - 1; p++) {
    const ring0 = profile[p];
    const ring1 = profile[p + 1];

    // Smooth shade ONLY across consecutive smooth crown rings so bevels and
    // every single reeded flute keep razor-sharp optical crease highlights!
    const isSmoothBand = (ring0.type === 'smooth' && ring1.type === 'smooth');
    const isVerticalFlutes = (ring0.type === 'ridgeTop' && ring1.type === 'ridgeBottom');

    for (let k = 0; k < SEG; k++) {
      const kNext = (k + 1) % SEG;

      ringPoint(ring0, k, vA);
      ringPoint(ring1, k, vB);
      ringPoint(ring1, kNext, vC);
      ringPoint(ring0, kNext, vD);

      let uvA: Point2, uvB: Point2, uvC: Point2, uvD: Point2;
      if (isVerticalFlutes) {
        const u0 = k / SEG;
        const u1 = (k + 1) / SEG;
        uvA = [u0, 1];
        uvB = [u0, 0];
        uvC = [u1, 0];
        uvD = [u1, 1];
      } else {
        uvA = [vA.x / (2 * rOut) + 0.5, vA.y / (2 * rOut) + 0.5];
        uvB = [vB.x / (2 * rOut) + 0.5, vB.y / (2 * rOut) + 0.5];
        uvC = [vC.x / (2 * rOut) + 0.5, vC.y / (2 * rOut) + 0.5];
        uvD = [vD.x / (2 * rOut) + 0.5, vD.y / (2 * rOut) + 0.5];
      }

      if (isSmoothBand) {
        computeSmoothRingNormal(p, k, nA);
        computeSmoothRingNormal(p + 1, k, nB);
        computeSmoothRingNormal(p + 1, kNext, nC);
        computeSmoothRingNormal(p, kNext, nD);

        // Triangle 1: (A, B, C)
        pushVertex(vA, nA, uvA[0], uvA[1]);
        pushVertex(vB, nB, uvB[0], uvB[1]);
        pushVertex(vC, nC, uvC[0], uvC[1]);

        // Triangle 2: (A, C, D)
        pushVertex(vA, nA, uvA[0], uvA[1]);
        pushVertex(vC, nC, uvC[0], uvC[1]);
        pushVertex(vD, nD, uvD[0], uvD[1]);
      } else {
        // Crisp flat facet per quad (gives machined jewel bevels & 120 sharp crystal flutes!)
        pushFlatTri(vA, vB, vC, uvA, uvB, uvC);
        pushFlatTri(vA, vC, vD, uvA, uvC, uvD);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();

  return geometry;
}

function normalizeEmblemGeometry(geometry: THREE.BufferGeometry, targetRadius = COIN_CONFIG.logoMaxRadius) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box || box.isEmpty()) return geometry;

  const center = new THREE.Vector3();
  box.getCenter(center);

  // Translate so XY is centered and min.z sits flush at 0
  geometry.translate(-center.x, -center.y, -box.min.z);
  geometry.computeBoundingSphere();

  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, 0.0001);

  // Measure actual radial extent so corners of square/rotated logos stay inside targetRadius
  const posAttr = geometry.attributes.position;
  let maxR = 0;
  for (let i = 0; i < posAttr.count; i++) {
    const r = Math.hypot(posAttr.getX(i), posAttr.getY(i));
    if (r > maxR) maxR = r;
  }
  const scale = targetRadius / Math.max(maxR, maxDim * 0.5);

  // Scale XY uniformly and leave a small clearance between the raised emblem and the rim.
  const currentDepth = Math.max(size.z, 0.001);
  const targetDepth = COIN_CONFIG.rimCrownHalfDepth - COIN_CONFIG.logoBaseZ - 0.003;
  const zScale = Math.min(scale, targetDepth / currentDepth);

  geometry.scale(scale, scale, zScale);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Countersign's two bands, extruded with the coin's existing crystal bevel. */
export function buildCountersignGeometry() {
  const rise = Math.tan(22 * Math.PI / 180);
  const bandHeight = 0.5;

  // The upper band is longer. Both share the same left edge and slope.
  const bands = [[1.4, 0.7], [1, 0]].map(([width, bottom]) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, bottom);
    shape.lineTo(width, bottom + width * rise);
    shape.lineTo(width, bottom + width * rise + bandHeight);
    shape.lineTo(0, bottom + bandHeight);
    shape.closePath();
    return shape;
  });

  const geometry = new THREE.ExtrudeGeometry(bands, {
    depth: 0.052,
    bevelEnabled: true,
    bevelThickness: 0.020,
    bevelSize: 0.015,
    bevelSegments: 4,
  });
  return normalizeEmblemGeometry(geometry);
}
