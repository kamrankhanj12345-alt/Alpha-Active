# Developer guide

How this site works, and the traps in it. Read the traps section before
touching rendering or scroll code — every one of them cost real debugging time
to find, and none of them announce themselves clearly.

---

## 1. The core idea

The page is **one camera move**, not a stack of sections.

`index.html` contains a single tall empty element:

```html
<div id="scroller"></div>   <!-- height: 700svh, nothing inside it -->
```

That element exists only to create scroll distance. ScrollTrigger scrubs it
into one number:

```js
const flight = { head: 0, roll: 0, fov: 42 };

gsap.to(flight, {
  head: 1,
  ease: "none",
  scrollTrigger: { trigger: "#scroller", start: "top top", end: "bottom bottom", scrub: 1.35 },
});
```

`flight.head` is the camera's position along the spline, 0 to 1. Every frame:

```js
curve.getPointAt(head, pos);                    // where the camera is
curve.getPointAt(head + 0.012, look);           // where it looks (ahead)
camera.position.copy(pos);
camera.lookAt(look);
```

Everything else — the copy, the bloom — hangs off that single value.

The five `.act` blocks are `position: fixed` overlays. They are not scrolled
past; they **cross-fade** as the flight passes their range. This is what makes
it read as a journey rather than a slideshow.

```js
acts.forEach((act, i) => {
  ScrollTrigger.create({
    trigger: "#scroller",
    start: `${(i / acts.length) * 100}% top`,
    end: `${((i + 1) / acts.length) * 100}% top`,
    onToggle: (self) => gsap.to(act, { autoAlpha: self.isActive ? 1 : 0, ... }),
  });
});
```

### Changing the flight path

`buildPath()` in `corridor.js` is a list of control points:

```js
const pts = [
  [0, 0, 0],
  [40, 14, -90],
  [-55, -10, -180],
  // ...
].map((p) => new THREE.Vector3(...p));
```

Large X/Y swings make the camera bank and dive. Small ones make it glide. If
you flatten these, the site immediately feels boring — the sense of travel comes
from lateral movement, not forward speed.

After editing the path, everything placed along it updates automatically,
because placement uses Frenet frames derived from the curve.

---

## 2. How the sense of speed is produced

Three things, in order of importance:

1. **Near-field geometry.** ~28% of monoliths are deliberately placed 7–16
   units from the path. Objects whipping past close to camera are what the eye
   reads as speed. Distant geometry barely registers.
2. **Scale contrast.** Monolith heights range 4 → 90 units. Without the big
   ones there is no sense of size; without the small ones there is no sense of
   proximity.
3. **Streaks.** 700 thin instanced boxes that stretch up to **70×** along the
   direction of travel, driven by measured velocity:

```js
const vel = Math.abs(head - lastHead) / dt;
corridor.speed += (Math.min(vel * 9, 1) - corridor.speed) * 0.08;  // smoothed
```

`corridor.speed` also feeds FOV, so accelerating visibly widens the lens.

**Everything is instanced.** 1,400 monoliths are one draw call. If you add
scenery, use `InstancedMesh` — do not add individual meshes in a loop.

---

## 3. Rendering

`world.js` sets up the renderer, the environment and the post chain.

```
RenderPass
EffectPass( bloom )                      <- convolution, needs its own pass
EffectPass( chromaticAberration )        <- convolution, needs its own pass
EffectPass( vignette, grain )            <- cheap, can share
EffectPass( SMAA )
```

ACES filmic tone mapping, `HalfFloatType` frame buffer (stops bloom banding),
device pixel ratio capped at 1.75.

### Warm-up

```js
warmup() {
  this.renderer.compile(this.scene, this.camera);
  this.composer.render(0.0001);
}
```

This compiles every shader and uploads every texture **before** the boot overlay
lifts. Without it, that cost lands on the visitor's first scroll as a visible
stall. Do not remove it.

---

## 4. Traps

These are the non-obvious ones. Each produced a confusing symptom that pointed
somewhere other than the cause.

### 4.1 `[hidden]` loses to any author `display` rule

```css
#nofallback { display: grid; }   /* overrides the UA [hidden]{display:none} */
```

The HTML `hidden` attribute works through the user-agent stylesheet rule
`[hidden] { display: none }`. **Any author rule setting `display` beats it.**

The symptom was an error panel rendering permanently over the whole site while
JavaScript correctly reported `element.hidden === true`. It looked like a WebGL
failure. It was CSS.

The fix is explicit, and it is in `style.css`:

```css
#nofallback[hidden] { display: none; }
```

If you add any element toggled with the `hidden` attribute **and** give it a
`display` rule, add the matching `[hidden]` rule too.

### 4.2 `postprocessing` will not merge two convolution effects

Bloom and chromatic aberration both sample multiple texels, so both are
CONVOLUTION effects. Putting them in one `EffectPass` throws at startup:

```
Error: Convolution effects cannot be merged (ChromaticAberrationEffect)
```

Each convolution effect needs its own pass. Cheap per-pixel effects (vignette,
grain) can still share one.

### 4.3 Three's `detail` parameter is `(d+1)²`, not `4^d`

```js
new THREE.IcosahedronGeometry(2.1, 64)   // 20 * 65^2  = 84,500 triangles
new THREE.IcosahedronGeometry(2.1, 6)    // 20 *  7^2  =    980 triangles
```

`PolyhedronGeometry` produces `20 * (detail + 1)²` faces. It is natural to
assume recursive subdivision (`4^detail`) — it is not.

Vertex displacement needs dense geometry. At `detail: 6` the core looked
faceted and cheap for a reason that was easy to misread as a shader problem.

### 4.4 Never call `getContext()` on the live canvas to feature-detect

```js
// WRONG — binds a context to the real canvas and burns one of the
// browser's limited live WebGL contexts on every page load
if (!document.getElementById("stage").getContext("webgl2")) { ... }
```

Once a canvas has a context, that context's attributes are fixed and the
renderer must inherit them. Worse, browsers cap live WebGL contexts (~16), and
repeated probing exhausts them until `getContext` starts returning `null` on a
perfectly capable machine.

`main.js` probes a throwaway canvas and releases it immediately:

```js
const probe = document.createElement("canvas");
const gl = probe.getContext("webgl2");
gl.getExtension("WEBGL_lose_context")?.loseContext();
```

### 4.5 `requestAnimationFrame` is paused in hidden tabs

The boot overlay's progress easing runs on GSAP's ticker, which is rAF-driven.
Browsers pause rAF for hidden tabs, so a visitor who opens the site in a
background tab would find a stalled overlay.

`main.js` has a wall-clock escape hatch, because `setTimeout` is not rAF-bound:

```js
const bailout = setTimeout(reveal, 9000);
```

Keep this. Any future loading or intro gate needs the same treatment.

GSAP also applies **lag smoothing**: on a low-frame-rate device it caps the time
delta, so animations play in slow motion rather than skipping. Useful for
tweens, fatal for a loading gate.

### 4.6 GSAP writes `transform` inline — CSS cannot override it

If you position an element with `gsap.quickTo(el, "x")`, that element must
carry **no** CSS `transform` and no transform utility class. Inline styles beat
every stylesheet.

Put positioning on an outer element and any hover scaling on an inner one.

### 4.7 `renderer.info` resets per pass

With `EffectComposer`, each pass resets the stats, so reading them after
`composer.render()` only reports the final fullscreen quad — about 1 triangle.

`world.js` takes manual control:

```js
this.renderer.info.autoReset = false;   // in the constructor
// ...
render(dt) {
  this.renderer.info.reset();           // once per frame
  this.composer.render(dt);
}
```

---

## 5. Accessibility and degradation

Both are implemented. Do not remove them.

**No WebGL:** the site does not show a dead end. The canvas is hidden, an
animated CSS gradient stands in, all copy stays readable and scrollable, and a
dismissible panel reports what the browser actually said. The 3D is garnish;
the copy is the page.

**Reduced motion:** `prefers-reduced-motion: reduce` disables smooth scroll,
the flight scrub and the intro. Check it with DevTools → Rendering → Emulate
CSS media feature.

**Touch:** Lenis runs with `smoothTouch: false`. Hijacking touch scrolling is
the fastest way to make a site feel broken on a phone. Leave it off.

---

## 6. Performance notes

- Everything repeated is instanced — one draw call per system.
- DPR capped at 1.75 (1.5 under 900px). This scene is fragment-bound, so pixel
  count is the single biggest cost on a high-DPI display.
- `frustumCulled = false` on instanced systems: their bounding spheres are
  wrong because instances are positioned by matrix, and culling would pop them
  out of view.
- Streak matrices are written on the CPU each frame. At 700 instances this is
  not the bottleneck and it keeps the motion readable. If you push past a few
  thousand, move it into a vertex shader.

The development HUD has been removed. For live numbers, run the dev server and
use the console: `__aa.world.stats` returns triangles and draw calls
(`window.__aa` exists in dev only and is stripped from production builds).

Below 900px wide, `corridor.js` halves `MONOLITHS`, `GATES` and `STREAKS` and
pulls the near-field monoliths and streaks further from the path. This is
decided once at load, so rotating a phone across the breakpoint does not
rebuild the world — reload to see the other set. `main.js` also widens the FOV
on portrait screens (aspect below 1), because three.js FOV is vertical and the
horizontal view otherwise collapses on a phone.

---

## 7. Conventions

- Plain ES modules, no TypeScript, no framework.
- One concern per file.
- Comments explain **why**, not what. If something looks odd, there is usually
  a reason written next to it — read it before simplifying.
- Colour tokens live in `:root` in `style.css`. Use the variables, not literals.
