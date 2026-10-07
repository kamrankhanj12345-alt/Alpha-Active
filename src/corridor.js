import * as THREE from "three";

/**
 * The world you fly through.
 *
 * The camera is not orbiting an object — it travels a ~900 unit CatmullRom
 * spline with large lateral swings, and everything here is placed in a Frenet
 * frame along that spline. Sense of speed comes from near-field geometry
 * whipping past, so monoliths are deliberately placed close to the path as
 * well as far from it.
 */

// Phones get half the instances and a calmer near-field. This is decided once
// at load: the counts are baked into each InstancedMesh, so rotating a device
// across the 900px line does not rebuild the world (a reload does).
const COMPACT = typeof window !== "undefined" && window.innerWidth < 900;
const MONOLITHS = COMPACT ? 700 : 1400;
const GATES = COMPACT ? 13 : 26;
const STREAKS = COMPACT ? 350 : 700;
const NEAR_MIN = COMPACT ? 11 : 7; // closest a near-field monolith may sit
const STREAK_MIN = COMPACT ? 8 : 5; // closest a speed streak may sit

export function buildPath() {
  // Big swings on X and Y so the flight banks hard rather than drifting.
  const pts = [
    [0, 0, 0],
    [40, 14, -90],
    [-55, -10, -180],
    [30, 26, -280],
    [-70, 8, -380],
    [20, -30, -470],
    [64, 12, -560],
    [-40, 30, -650],
    [10, -14, -740],
    [-24, 6, -820],
    [0, 0, -900],
  ].map((p) => new THREE.Vector3(...p));

  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4);
  curve.arcLengthDivisions = 2000;
  return curve;
}

export class Corridor {
  constructor(scene, curve) {
    this.curve = curve;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.frames = curve.computeFrenetFrames(600, false);
    this._buildMonoliths();
    this._buildGates();
    this._buildStreaks();

    this.speed = 0; // 0..1, drives streak stretch
  }

  /** Position/orient on the spline's local frame at t, offset perpendicular. */
  _frameAt(t, sideways, up) {
    const i = Math.min(599, Math.max(0, Math.floor(t * 600)));
    const p = this.curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
    const n = this.frames.normals[i];
    const b = this.frames.binormals[i];
    return p
      .clone()
      .addScaledVector(n, sideways)
      .addScaledVector(b, up);
  }

  _buildMonoliths() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x0d0a1c,
      metalness: 1,
      roughness: 0.28,
      iridescence: 0.85,
      iridescenceIOR: 1.7,
      iridescenceThicknessRange: [180, 900],
      envMapIntensity: 1.6,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, MONOLITHS);
    mesh.frustumCulled = false;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const colour = new THREE.Color();

    for (let i = 0; i < MONOLITHS; i++) {
      const t = Math.random();
      // Bias toward the corridor wall, but let some sit close for speed cues.
      const near = Math.random() < 0.28;
      const radius = near ? NEAR_MIN + Math.random() * 9 : 20 + Math.random() * 70;
      const angle = Math.random() * Math.PI * 2;

      const pos = this._frameAt(
        t,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.7,
      );

      // Tall slabs, wildly varied — scale contrast is what sells the size.
      const h = near ? 4 + Math.random() * 26 : 12 + Math.random() * 90;
      s.set(0.6 + Math.random() * 3.4, h, 0.6 + Math.random() * 3.4);

      e.set(
        (Math.random() - 0.5) * 0.5,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.5,
      );
      q.setFromEuler(e);

      m.compose(pos, q, s);
      mesh.setMatrixAt(i, m);

      // A few glow violet/lime, most stay dark — sparse accents read better.
      const r = Math.random();
      colour.setHex(r > 0.94 ? 0xccff00 : r > 0.86 ? 0x8b5cf6 : 0x0d0a1c);
      mesh.setColorAt(i, colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this.monoliths = mesh;
    this.group.add(mesh);
  }

  _buildGates() {
    const geo = new THREE.TorusGeometry(1, 0.035, 8, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xccff00,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, GATES);
    mesh.frustumCulled = false;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 0, 1);

    for (let i = 0; i < GATES; i++) {
      const t = (i + 0.5) / GATES;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      q.setFromUnitVectors(up, tan);
      const r = 9 + Math.sin(i * 1.7) * 4 + Math.random() * 6;
      s.setScalar(r);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;

    this.gates = mesh;
    this.group.add(mesh);
  }

  /**
   * Speed streaks: thin boxes scattered near the path that stretch along the
   * direction of travel as velocity rises. Cheap, and the single strongest
   * motion cue at speed.
   */
  _buildStreaks() {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa78bfa,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, STREAKS);
    mesh.frustumCulled = false;

    this.sData = new Float32Array(STREAKS * 3); // t, angle, radius
    for (let i = 0; i < STREAKS; i++) {
      this.sData[i * 3 + 0] = Math.random();
      this.sData[i * 3 + 1] = Math.random() * Math.PI * 2;
      this.sData[i * 3 + 2] = STREAK_MIN + Math.random() * 26;
    }

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 0, 1);

    this.streaks = mesh;
    this.group.add(mesh);
  }

  /** `head` is the camera's position along the curve (0..1). */
  update(head, t) {
    const stretch = 1 + this.speed * 70;

    for (let i = 0; i < STREAKS; i++) {
      const o = i * 3;
      // Keep streaks in a moving window just ahead of the camera.
      let st = (this.sData[o] + head) % 1;
      const angle = this.sData[o + 1] + t * 0.15;
      const radius = this.sData[o + 2];

      const pos = this._frameAt(
        st,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.7,
      );
      const tan = this.curve.getTangentAt(THREE.MathUtils.clamp(st, 0, 1));
      this._q.setFromUnitVectors(this._up, tan);
      this._s.set(1, 1, stretch);

      this._m.compose(pos, this._q, this._s);
      this.streaks.setMatrixAt(i, this._m);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
    this.streaks.material.opacity = 0.12 + this.speed * 0.75;

    this.gates.material.opacity = 0.28 + this.speed * 0.5;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
