import * as THREE from "three";
import { SIMPLEX_3D } from "./noise.glsl.js";

/**
 * The hero object.
 *
 * Built on MeshPhysicalMaterial rather than a hand-rolled ShaderMaterial so we
 * inherit Three's real PBR, thin-film iridescence and HDRI reflections for
 * free, then inject vertex displacement through onBeforeCompile. Rolling our
 * own shader would have meant reimplementing all of that badly.
 *
 * Normals are recomputed in the vertex shader by sampling the displacement at
 * two tangent offsets and crossing the differences — without that the lighting
 * stays flat and the displacement reads as a silhouette wobble rather than
 * actual surface.
 */
export class Core {
  constructor(scene) {
    this.uniforms = {
      uTime: { value: 0 },
      uAmp: { value: 0.34 },
      uFreq: { value: 1.35 },
      uFracture: { value: 0 },
    };

    // Three's PolyhedronGeometry `detail` yields 20 * (detail + 1)^2 faces —
    // NOT 20 * 4^detail. detail 64 is therefore ~84.5k triangles, which is what
    // the noise displacement needs to read as surface rather than faceting.
    // (detail 6 would be 980 triangles, nowhere near enough.)
    const geometry = new THREE.IcosahedronGeometry(2.1, 64);

    const material = new THREE.MeshPhysicalMaterial({
      color: 0x120c24,
      metalness: 1.0,
      roughness: 0.16,
      iridescence: 1.0,
      iridescenceIOR: 1.9,
      iridescenceThicknessRange: [120, 720],
      envMapIntensity: 1.5,
      sheen: 0.4,
      sheenColor: new THREE.Color(0x8b5cf6),
    });

    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          /* glsl */ `
          #include <common>
          uniform float uTime;
          uniform float uAmp;
          uniform float uFreq;
          uniform float uFracture;
          ${SIMPLEX_3D}

          vec3 displace(vec3 p, vec3 n){
            float d = fbm(p * uFreq + vec3(0.0, 0.0, uTime * 0.22));
            // Fracture pushes high-frequency spikes as the scroll advances.
            d += uFracture * snoise(p * 3.4 + uTime * 0.5) * 0.85;
            return p + n * d * uAmp;
          }

          void orthoBasis(vec3 n, out vec3 t, out vec3 b){
            t = normalize(abs(n.y) < 0.99 ? cross(vec3(0.0,1.0,0.0), n)
                                          : cross(vec3(1.0,0.0,0.0), n));
            b = cross(n, t);
          }
        `,
        )
        .replace(
          "#include <beginnormal_vertex>",
          /* glsl */ `
          vec3 objectNormal;
          {
            vec3 T, B;
            orthoBasis(normal, T, B);
            float eps = 0.04;
            vec3 p0 = displace(position, normal);
            vec3 p1 = displace(position + T * eps, normalize(normal + T * eps));
            vec3 p2 = displace(position + B * eps, normalize(normal + B * eps));
            objectNormal = normalize(cross(p1 - p0, p2 - p0));
          }
        `,
        )
        .replace(
          "#include <begin_vertex>",
          /* glsl */ `
          vec3 transformed = displace(position, normal);
        `,
        );
    };
    // Any change to onBeforeCompile output needs a distinct cache key.
    material.customProgramCacheKey = () => "alpha-core-v1";

    this.mesh = new THREE.Mesh(geometry, material);
    this.material = material;

    // Emissive inner shell — reads as energy inside the object and gives the
    // bloom pass something bright to grab without blowing out the surface.
    const glow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.72, 24),
      new THREE.MeshBasicMaterial({
        color: 0xccff00,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.glow = glow;

    // Wireframe cage, slightly larger, for a "containment field" read.
    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.55, 6),
      new THREE.MeshBasicMaterial({
        color: 0x8b5cf6,
        wireframe: true,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
    );
    this.cage = cage;

    this.group = new THREE.Group();
    this.group.add(this.mesh, glow, cage);
    scene.add(this.group);
  }

  update(t, dt) {
    this.uniforms.uTime.value = t;
    this.group.rotation.y += dt * 0.09;
    this.mesh.rotation.x = Math.sin(t * 0.18) * 0.12;
    this.cage.rotation.y -= dt * 0.22;
    this.cage.rotation.z += dt * 0.07;
    this.glow.scale.setScalar(1 + Math.sin(t * 1.3) * 0.02);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
