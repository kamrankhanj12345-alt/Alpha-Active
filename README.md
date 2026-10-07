# Alpha Active — 3D studio site

A scroll-driven WebGL site for Alpha Active Technology L.L.C, a game development
studio in Dubai. The camera flies a ~1,200-unit path through a corridor of
instanced architecture; the page copy rides along as fixed overlays.

---

## Run it

Requires **Node 20+**.

```bash
npm install
npm run dev      # http://localhost:4200
```

```bash
npm run build    # outputs to dist/
npm run preview  # serve the built output
```

`dist/` is plain static files — drop it on any host (Netlify, Vercel, S3,
nginx). No server code, no environment variables, no database.

---

## What's in here

```
index.html          Markup: boot overlay, canvas, nav, the five acts
vite.config.js      Dev server on 4200, build target es2022
public/hdri/        Environment map (see "Assets" below)
src/
  main.js           Orchestrator: loading, scroll wiring, camera, frame loop
  world.js          Renderer, camera, environment, post-processing chain
  corridor.js       The world you fly through — path, monoliths, gates, streaks
  core.js           The destination object at the end of the flight
  noise.glsl.js     Shared GLSL simplex noise
  style.css         All styling
```

Seven files. There is no framework and no component system — it is deliberately
small so the whole thing fits in your head.

---

## Stack

| | |
| --- | --- |
| **Three.js** | WebGL rendering |
| **GSAP + ScrollTrigger** | Scroll choreography |
| **Lenis** | Smooth scrolling |
| **postprocessing** | Bloom, chromatic aberration, vignette, grain, SMAA |
| **Vite** | Dev server and bundler |

No UI framework. No CSS framework.

---

## Assets and licensing

The only binary asset is `public/hdri/studio.hdr` — the environment map that
lights every metal surface and supplies all the reflections.

It is **`studio_small_09` from Poly Haven**, released under **CC0** (public
domain). Commercial use is fine, no attribution is required, there is no
revenue threshold. If you replace it, confirm the replacement is licensed for
commercial use — this is a client site.

It is the 2k version, not 4k, on purpose: Three converts the HDRI into a PMREM
cubemap whose top mip is far smaller than either, so 4k would cost four times
the download for no visible gain in reflections.

To swap it:

```bash
curl -o public/hdri/studio.hdr \
  "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/<name>_2k.hdr"
```

---

## Where to start reading

1. **`src/main.js`** — start here. It is the spine: it loads, wires scroll to a
   single `flight.head` value, and drives the camera each frame.
2. **`src/corridor.js`** — the spline and everything placed along it.
3. **`src/world.js`** — renderer and post chain.
4. **`src/core.js`** — the shader-displaced object at the end.

`DEVELOPER-GUIDE.md` explains *why* things are built the way they are, and
lists several non-obvious traps that will cost you an afternoon if you hit them
blind. **Read it before changing rendering or scroll code.**

`TASKS.md` is what is left to build.
