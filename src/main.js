import "./style.css";

import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { World } from "./world.js";
import { Core } from "./core.js";
import { Corridor, buildPath } from "./corridor.js";

gsap.registerPlugin(ScrollTrigger);

const canvas = document.getElementById("stage");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Probe support on a throwaway canvas, never the real one.
 *
 * getContext() on the live canvas permanently binds a context with those
 * attributes, which the renderer then inherits — and every probe burns one of
 * the browser's limited live contexts. Losing the throwaway hands it back.
 */
function probeWebGL2() {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    if (!gl) return { ok: false, reason: "No WebGL2 context" };
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const info = {
      ok: true,
      renderer: dbg
        ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    };
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return info;
  } catch (e) {
    return { ok: false, reason: String(e).slice(0, 120) };
  }
}

const support = probeWebGL2();

if (!support.ok) {
  // Degrade, do not block — the copy is the page, the 3D is the garnish.
  document.documentElement.classList.add("no-webgl");
  document.getElementById("boot").classList.add("done");
  const panel = document.getElementById("nofallback");
  panel.hidden = false;
  panel.querySelector(".diag").innerHTML =
    `Reported: <b>${support.reason || "unknown"}</b><br />` +
    `If unexpected, check hardware acceleration (chrome://gpu) and reload.`;
  document
    .getElementById("dismiss")
    .addEventListener("click", () => (panel.hidden = true));
} else {
  boot();
}

function boot() {
  /* ── Loading ───────────────────────────────────────────────────── */
  const manager = new THREE.LoadingManager();
  const bootEl = document.getElementById("boot");
  const fillEl = document.getElementById("boot-fill");
  const pctEl = document.getElementById("boot-pct");
  const noteEl = document.getElementById("boot-note");

  let target = 0;
  let shown = 0;
  manager.onProgress = (_u, loaded, total) => {
    target = total ? loaded / total : 1;
  };

  const world = new World(canvas, manager);
  const curve = buildPath();
  const corridor = new Corridor(world.scene, curve);
  const core = new Core(world.scene);

  // The core is the destination, parked at the end of the flight.
  core.group.position.copy(curve.getPointAt(1));
  core.group.scale.setScalar(2.6);

  let ready = false;
  manager.onLoad = () => {
    target = 1;
    noteEl.textContent = "Compiling shaders";
    requestAnimationFrame(() => {
      world.warmup();
      ready = true;
      noteEl.textContent = "Ready";
    });
  };
  manager.onError = () => {
    target = 1;
    ready = true;
    noteEl.textContent = "Environment unavailable — continuing";
  };

  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    clearTimeout(bailout);
    shown = 1;
    fillEl.style.width = "100%";
    pctEl.textContent = "100%";
    bootEl.classList.add("done");
    intro();
  }
  function maybeReveal() {
    if (ready && shown >= 0.995) reveal();
  }
  // Wall-clock escape hatch: progress easing runs on GSAP's rAF ticker, and
  // browsers pause rAF for hidden tabs. setTimeout is not rAF-bound.
  const bailout = setTimeout(reveal, 9000);

  /* ── Smooth scroll sharing GSAP's ticker ───────────────────────── */
  const lenis = new Lenis({
    duration: 1.4,
    smoothWheel: !reduced,
    smoothTouch: false, // hijacking touch scroll makes a site feel broken
  });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0); // would desync Lenis from ScrollTrigger

  /* ── The flight ────────────────────────────────────────────────── */
  // `head` is position along the spline. Scroll drives it end to end, so the
  // entire page IS the camera move rather than a set of separate animations.
  const flight = { head: 0, roll: 0, fov: 42, shake: 0 };

  if (!reduced) {
    gsap.to(flight, {
      head: 1,
      ease: "none",
      scrollTrigger: {
        trigger: "#scroller",
        start: "top top",
        end: "bottom bottom",
        scrub: 1.35,
      },
    });

    // Punch the FOV and roll the camera at act boundaries so the journey has
    // beats instead of one constant glide.
    const beats = gsap.timeline({
      scrollTrigger: {
        trigger: "#scroller",
        start: "top top",
        end: "bottom bottom",
        scrub: 1.1,
      },
    });
    beats
      .to(flight, { fov: 78, roll: 0.5 }, 0.0)
      .to(flight, { fov: 46, roll: -0.7 }, 0.9)
      .to(flight, { fov: 92, roll: 1.1 }, 1.8)
      .to(flight, { fov: 40, roll: -0.35 }, 2.7)
      .to(flight, { fov: 58, roll: 0 }, 3.6);

    gsap.to(world.bloom, {
      intensity: 2.6,
      scrollTrigger: { trigger: "#scroller", start: "top top", end: "bottom bottom", scrub: 1 },
    });
    gsap.to("#progress-fill", {
      scaleX: 1,
      ease: "none",
      scrollTrigger: { trigger: "#scroller", start: "top top", end: "bottom bottom", scrub: 0.3 },
    });
  }

  /* ── Copy overlays: fixed, and handed off as the flight passes ─── */
  const acts = gsap.utils.toArray(".act");

  function syncActVisibility(progress = 0) {
    acts.forEach((act, i) => {
      const start = i / acts.length;
      const end = (i + 1) / acts.length;
      const active = progress >= start && progress < end;
      gsap.to(act, {
        autoAlpha: active ? 1 : 0,
        y: active ? 0 : 26,
        duration: active ? 0.4 : 0.15,
        ease: "power2.out",
        overwrite: true,
      });
      act.setAttribute("aria-hidden", active ? "false" : "true");
      if ("inert" in HTMLElement.prototype) {
        act.inert = !active;
      }
    });
  }

  ScrollTrigger.create({
    trigger: "#scroller",
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => syncActVisibility(self.progress),
    onRefresh: (self) => syncActVisibility(self.progress),
  });

  syncActVisibility(0);
  requestAnimationFrame(() => syncActVisibility(0));

  function intro() {
    if (reduced) return;
    gsap.from("#act-1 h1 .l", { yPercent: 115, duration: 1.05, stagger: 0.09, ease: "power4.out" });
    gsap.from("#act-1 .kick, #act-1 p, #act-1 .btns", {
      y: 26, opacity: 0, duration: 0.8, stagger: 0.1, delay: 0.35, ease: "power3.out",
    });
  }

  /* ── Pointer parallax ──────────────────────────────────────────── */
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", (e) => {
    ptr.tx = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* ── Frame ─────────────────────────────────────────────────────── */
  const clock = new THREE.Clock();
  const look = new THREE.Vector3();
  const pos = new THREE.Vector3();
  let lastHead = 0;

  gsap.ticker.add(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (!revealed) {
      shown += (target - shown) * 0.08;
      if (target === 1 && shown > 0.99) shown = 1;
      const p = Math.round(shown * 100);
      fillEl.style.width = p + "%";
      pctEl.textContent = p + "%";
      maybeReveal();
    }

    const head = THREE.MathUtils.clamp(flight.head, 0, 0.999);

    // Velocity along the path drives streak stretch and a little FOV kick.
    const vel = Math.abs(head - lastHead) / Math.max(dt, 0.0001);
    lastHead = head;
    corridor.speed += (Math.min(vel * 9, 1) - corridor.speed) * 0.08;

    // Camera rides the spline, looking a little way ahead.
    curve.getPointAt(head, pos);
    curve.getPointAt(Math.min(head + 0.012, 1), look);

    ptr.x += (ptr.tx - ptr.x) * 0.05;
    ptr.y += (ptr.ty - ptr.y) * 0.05;

    world.camera.position.copy(pos);
    world.camera.position.x += ptr.x * 2.2;
    world.camera.position.y += -ptr.y * 1.6;
    world.camera.lookAt(look);
    world.camera.rotation.z = flight.roll + Math.sin(t * 0.4) * 0.02;

    // three.js FOV is vertical, so on a portrait phone the horizontal view
    // collapses. Widen it as the aspect drops below 1 (desktop is untouched:
    // the boost is 1 and the cap sits above the largest desktop value, 108).
    const aspect = world.camera.aspect;
    const boost = aspect < 1 ? 1 + (1 - aspect) * 0.3 : 1;
    const targetFov = Math.min((flight.fov + corridor.speed * 16) * boost, 110);
    world.camera.fov += (targetFov - world.camera.fov) * 0.06;
    world.camera.updateProjectionMatrix();

    // The destination reacts as you close on it.
    core.uniforms.uFracture.value = 0.15 + corridor.speed * 0.8;
    core.update(t, dt);
    corridor.update(head, t);

    world.render(dt);
  });

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const idx = acts.findIndex((s) => "#" + s.id === id);
      if (idx < 0) return;
      e.preventDefault();
      const max = document.documentElement.scrollHeight - window.innerHeight;
      lenis.scrollTo((idx / acts.length) * max + 10);
    });
  });

  window.addEventListener("resize", () => ScrollTrigger.refresh(), { passive: true });

  if (import.meta.env.DEV) window.__aa = { world, core, corridor, curve, flight, lenis, THREE };
}
