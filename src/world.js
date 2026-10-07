import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  VignetteEffect,
  BlendFunction,
} from "postprocessing";

/**
 * Renderer, camera, environment and the post chain.
 *
 * The HDRI is CC0 from Poly Haven (studio_small_09) — commercial use, no
 * attribution required. It is loaded at 2k rather than 4k on purpose: Three
 * converts it to a PMREM cubemap whose top mip is far smaller than either, so
 * 4k costs four times the download for no visible gain in reflections.
 */
export class World {
  constructor(canvas, manager) {
    this.canvas = canvas;
    this.manager = manager;
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // SMAA in the post chain handles this more cheaply
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    this.renderer.setClearColor(0x04030a, 1);
    // EffectComposer runs several passes per frame and renderer.info resets on
    // every one, so the stats would only ever report the final fullscreen quad.
    // Take manual control and reset once per frame instead.
    this.renderer.info.autoReset = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x04030a, 0.055);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0, 0, 9);

    // A little rim light on top of the HDRI so silhouettes stay readable
    // against the dark background.
    const key = new THREE.DirectionalLight(0x8b5cf6, 2.2);
    key.position.set(4, 6, 5);
    const rim = new THREE.DirectionalLight(0xccff00, 1.4);
    rim.position.set(-6, -2, -4);
    this.scene.add(key, rim);

    this._buildComposer();
    this._loadEnvironment();

    this.resize();
    window.addEventListener("resize", () => this.resize(), { passive: true });
  }

  _buildComposer() {
    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType, // keeps bloom from banding
    });
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new BloomEffect({
      intensity: 1.35,
      luminanceThreshold: 0.22,
      luminanceSmoothing: 0.5,
      mipmapBlur: true,
      radius: 0.72,
    });

    this.chroma = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.0006, 0.0006),
      radialModulation: true,
      modulationOffset: 0.25,
    });

    const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.75 });
    const noise = new NoiseEffect({
      blendFunction: BlendFunction.OVERLAY,
      premultiply: true,
    });
    noise.blendMode.opacity.value = 0.055;

    // Bloom and chromatic aberration are both CONVOLUTION effects, and
    // postprocessing refuses to merge two of those into one EffectPass — each
    // needs its own. The cheap per-pixel effects can still share a pass.
    this.composer.addPass(new EffectPass(this.camera, this.bloom));
    this.composer.addPass(new EffectPass(this.camera, this.chroma));
    this.composer.addPass(new EffectPass(this.camera, vignette, noise));
    this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
  }

  _loadEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();

    new RGBELoader(this.manager).load("/hdri/studio.hdr", (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const env = pmrem.fromEquirectangular(texture).texture;
      this.scene.environment = env;
      this.scene.environmentIntensity = 0.85;
      texture.dispose();
      pmrem.dispose();
    });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Cap DPR: this scene is fragment-bound, so pixel count is the single
    // biggest cost on a high-DPI display.
    const dpr = Math.min(window.devicePixelRatio || 1, w < 900 ? 1.5 : 1.75);

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Compile every shader and upload every texture before the first frame is
   * shown. Without this the cost lands on the user's first scroll as a stall.
   */
  warmup() {
    this.renderer.compile(this.scene, this.camera);
    this.composer.render(0.0001);
  }

  render(dt) {
    this.renderer.info.reset();
    this.composer.render(dt);
  }

  get stats() {
    const info = this.renderer.info.render;
    return { triangles: info.triangles, calls: info.calls };
  }
}
