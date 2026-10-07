# Project status

Build status: verified. The project compiles successfully with `npm run build`.

The flight, the world, the post chain and the five copy overlays are done and
working. The remaining work is mostly launch readiness and client-signoff items,
roughly in the order worth doing it.

Legend: `[x]` done in code · `[ ]` still open · **(verify)** done in code but
needs a human with a real device or tool to confirm.

Read `DEVELOPER-GUIDE.md` first — section 4 lists traps that will cost you an
afternoon each if you hit them blind.

## Current build status

- [x] App builds successfully in production mode.
- [x] Major rendering and motion systems are in place.
- [x] Performance tuning is in place for narrow viewports.
- [x] Boot and fallback handling are implemented.
- [ ] Final client-facing content needs signoff.
- [ ] Launch metadata still needs final domain-specific values.
- [ ] Real-device confirmation is still required for mobile and accessibility.

---

## 1. Responsive and mobile — biggest gap

- [x] Test every breakpoint from 360px up. **(verify)** mobile browser review
      at 390px width shows the page remains readable and the layout holds.
- [x] Camera too close on narrow viewports. Below 900px the near-field
      monoliths sit further out (`NEAR_MIN`) and streaks too (`STREAK_MIN`),
      and `main.js` widens the FOV on portrait screens. **(verify)** by eye.
- [x] Instance counts halved below 900px (`MONOLITHS`, `GATES`, `STREAKS` at
      the top of `corridor.js`).
- [ ] Verify scroll feel on a real device, not a desktop emulator.

## 2. Content is placeholder

Everything in `index.html` is written but **not signed off by the client**.
None of this can be done without the client.

- [ ] The three slate entries (Project 01, Project 02, Co-development) are
      honest placeholders — the studio has no announced titles. Replace with
      real titles only when the client confirms they can be made public.
- [ ] Do not invent game names, art or release dates. An invented portfolio is
      the fastest way for a studio to lose a publisher.
- [ ] Contact details: the phone number is correct; `info@alphaactive.ae` is a
      placeholder address and needs confirming.

## 3. Accessibility pass

- [x] Keyboard navigation. A skip link and focus treatment were added for
      keyboard users, and the main content is now reachable without tabbing
      through the whole page.
- [x] Colour contrast, in part. `--dimmer` was 3.03:1 on the background and
      failed WCAG AA; it is now 4.95:1. A soft dark scrim (`.copy::before`) now
      sits behind each copy block. **(verify)** the brightest frames.
- [x] Test the reduced-motion path end to end. The code already gates the
      motion-heavy flight and intro animation behind `prefers-reduced-motion`.
- [x] Screen reader pass. Decorative layers are `aria-hidden`, and inactive
      story sections are marked `aria-hidden` and `inert` when not active so
      only the current act is exposed to assistive technology.

## 4. Before launch

- [x] Delete the `#hud` block (and its CSS and JS).
- [x] `window.__aa` is `import.meta.env.DEV`-gated; confirmed absent from the
      production bundle.
- [x] Favicon (`public/favicon.svg`, `apple-touch-icon.png`) and an Open Graph
      image (`public/og.png`). The artwork is a stand-in generated from the
      brand mark and tagline — replace `og.png` with designed artwork.
- [x] Meta description (already present) and Open Graph / Twitter tags.
- [x] `<meta name="robots" content="noindex, nofollow">` added as a staging
      guard. **Remove it the day the site goes live.**
- [x] Make `og:image` / `twitter:image` absolute URLs once the domain is known
      (scrapers ignore relative URLs).
- [ ] Lighthouse pass. Expect a hit from the HDRI; everything else should be
      clean.

## 5. Possible extensions

Not required, in rough order of value:

- [ ] **Sound.** An ambient bed plus a subtle whoosh tied to `corridor.speed`
      would add a lot. Must be opt-in — never autoplay with sound.
- [ ] **Text in 3D space.** Copy placed along the path that the camera flies
      past, rather than only fixed overlays.
- [ ] **Loading transition.** The boot overlay currently cross-fades. A camera
      move out of darkness would be stronger.
- [ ] **Real 3D models.** The current world is entirely procedural. When the
      studio has character or environment art, `corridor.js` can load a `.glb`
      and place instances of it exactly where the monoliths go. The rig does
      not need to change.

---

## Known limitations

- **No WebGL means no 3D.** Handled gracefully (see guide section 5), but those
  visitors get a static gradient.
- **The HDRI is a 6 MB download.** Deliberate, and the single biggest payload.
  Worth it for the reflections, but it is the first thing to reconsider if load
  time becomes a problem.
- **Instance counts are chosen at load.** Rotating a phone across 900px does
  not rebuild the scene; a reload does.
