# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A WebGL2 "observatory" with six switchable scenes: a Schwarzschild black hole (Sgr A*), the Milky Way, the Solar System, a black-widow pulsar (PSR J0952-0607), a stellar nursery, and an exoplanet system (TRAPPIST-1). Static site, ES modules, no build step, no deps. Five scenes raymarch; the exoplanet one is analytic (see below).

## Running / testing

No build, no package.json, no test suite. **Must be served over http(s)** — ES modules are blocked by CORS on `file://`, so double-clicking `index.html` no longer works (it did before the module split; see git history if you need that fallback). Serve locally:

```bash
python -m http.server 8000   # then open http://localhost:8000
```

There's no CLI dev loop — verify changes by reloading in-browser and watching the canvas + telemetry HUD. If `run` skill is available, use it to launch and screenshot.

GitHub Pages deploys from `.github/workflows/pages.yml` on push to `main` — a plain upload-artifact/deploy-pages pair, no build step. It replaced the legacy branch build, which ran Jekyll over the tree for no reason and started failing; `.nojekyll` is kept as belt-and-braces. If Pages ever silently serves a stale site, check that Settings -> Pages -> Source is still "GitHub Actions".

## Architecture

### File layout
```
index.html         HTML skeleton only — canvas, HUD DOM, <link>/<script type=module>
css/style.css       all CSS (HUD chrome, responsive breakpoints)
js/state.js         S (mutable state), SCENES (per-scene config), QUALITY presets — no imports, safe to import from anywhere
js/shaders.js       every GLSL source as exported template-literal strings — no imports
js/ephemeris.js     JS mirror of the Solar System orbit math + TRAPPIST-1 data/transit model (see below) — imports S from state.js
js/gl.js            WebGL2 context, shader compile/link, render-target helpers — imports VS from shaders.js
js/programs.js      compiles the 9 GL programs from shaders.js via gl.js
js/render.js        resize()/applyQuality()/frame() — the render loop and camera math
js/hud.js           updateHud() + per-scene telemetry (hudHole/hudGalaxy/hudSolar/hudPulsar/hudNebula/hudExo), the SI unit conversions, and the transit light curve canvas
js/ui.js            pointer/wheel/touch/keyboard input, scene+focus switching, hash routing, sliders/buttons, guided tour, snapshot/share, unit toggle, boot sequence
js/main.js          entry point — imports the above and kicks off the render loop
```
Import graph is a DAG, no cycles: `state.js`/`shaders.js` are leaves; `render.js` and `ui.js` are the two biggest consumers and neither imports the other (render.js needs no UI state; ui.js reads `render.js`'s `resize`/`applyQuality`/`VIEW` one-directionally). The one piece of state both `render.js` and `ui.js` touch — whether the pointer is currently dragging — lives in `state.js` (`dragging`/`setDragging`) rather than being passed between them.

**Adding a new scene**: write `FS_YOURSCENE = GLSL_HEAD + \`...\`` in `shaders.js`, add its camera framing/HUD copy to `SCENES` in `state.js`, compile it in `programs.js`, add its uniform-setting branch + program-select in `render.js`'s `frame()`, and a nav button (`data-go="yourscene"`) in `index.html` — `ui.js`'s delegated `.navb` listener and the CSS `[data-sc]` visibility rules pick it up automatically.

### Shader pipeline (`js/shaders.js`)
- `GLSL_HEAD` — shared prelude (uniforms, hash/noise functions, procedural starfield/nebula `deepField()`) prepended to each scene's fragment shader source.
- Scene fragment shaders: `FS_SCENE` (black hole — null geodesic integration via RK2, accretion disk, relativistic jet), `FS_MW` (galaxy), `FS_SS` (solar system — planets, moons, asteroid belt, orbit rings), `FS_PULSAR` (PSR J0952-0607 — oblique-rotator beams split into radio/gamma bands on separate axes, plus the evaporating companion; no geodesic bending needed since the surface sits above the photon sphere), `FS_NEBULA` (stellar nursery — ionization-driven colour, see below), `FS_XP` (TRAPPIST-1).
- `FS_XP` is the one scene with **no march loop at all** — eight solid spheres plus a flat annulus, so it uses analytic ray-sphere intersection. `uSteps` is optimised out of it and out of `FS_SS`, which is why `render.js` guards `if(PS.u.uSteps)` before setting it, and why `hud.js` prints `ANALYTIC` instead of a step count there.
- Volumetric scenes live or die on the **emission/absorption ratio**: a sightline saturates at `emit/ab`, so keeping that ratio under ~1 (galaxy(): 0.42 vs 0.63) is what makes density variation show up as brightness variation. Both `FS_NEBULA` and `FS_PULSAR` were once featureless white blobs from getting this wrong — the comments there record the calibration.
- Post pipeline: `FS_BRIGHT` (bloom threshold) → `FS_BLUR` (separable gaussian, run twice for two mip levels into `bloomA`/`bloomB`) → `FS_COMP` (final composite: ACES tonemap, chromatic aberration, vignette, scanlines, grain).
- `prog(fs)` (in `gl.js`) compiles+links each shader, auto-introspects active uniforms into a `{name: location}` map — no manual uniform location bookkeeping.

### Scene/state model (`js/state.js`)
- `S` — single mutable state object: camera (yaw/pitch/dist + `t`-prefixed easing targets), per-scene slider values, `scene` name, `focus` (which body the camera is locked to, solar system only), quality level.
- `SCENES` — per-scene static config: camera framing (dist/pitch/min/max), HUD label text, telemetry unit labels, ticker copy.
- `QUALITY` — 4 presets (LOW/MEDIUM/HIGH/ULTRA) controlling render resolution scale and raymarch step count; `render.js` also has an auto quality-drop path (watches frame time, downgrades under load).
- Scene switching (`setScene`) and body focus (`setFocus`), both in `ui.js`, drive both the camera framing and which `[data-sc]` HUD rows/controls are visible (pure CSS attribute-selector visibility in `style.css`, not JS show/hide).
- URL hash (`#bh`, `#mw`, `#ss`, `#ss/earth`, etc.) is the source of truth for deep-linking: `applyHash()`/`publishState()` in `ui.js` keep it in sync with `S.scene`/`S.focus` and also update `document.title`.

### Shader/JS physics duplication (important when editing)
Two places duplicate orbit math between GLSL and JS on purpose, because the JS side answers questions the shader can't (camera framing, click-picking, plotting):

- **Solar system**: `FS_SS` in `shaders.js` vs `planetPos`/`sunPos`/`orbR` in `ephemeris.js` — must stay numerically identical (same `ORB_RATE`, `P_AU`/`AU`, `P_PH0`/`PH0`, `P_ECC`/`ECC`, `P_INC`/`INC`, `P_NODE`/`NODE`, radius-compression exponent).
- **TRAPPIST-1**: `FS_XP`'s `P_DAY`/`P_ORB`/`DAY_RATE` vs `XP_FACTS`/`XP_ORB`/`XP_DAY_RATE` in `ephemeris.js`, which is what `xpFlux()` and the HUD light curve are computed from. Drift here shows up as the plotted transits not lining up with the planets you can see crossing the star.

If you change orbital mechanics in one, mirror it in the other — comments on both sides flag this.

Scale honesty: several scenes exaggerate or compress geometry (solar system radii as `a^0.48`, TRAPPIST-1's as `a^0.62`, the pulsar's binary separation, planet/companion radii, the pulsar's beam sweep rate). Each departure is named in a comment where it is applied, and the HUD quotes the real figure. Keep that pattern: exaggerate if you must, then say so in the comment and keep the readout true.

### Render loop (`js/render.js`)
`frame(now)` is the single rAF loop: advances camera easing, updates uniforms, draws each scene shader to an offscreen target, runs the bloom passes, composites to screen, then calls `updateHud()` (from `hud.js`) to refresh telemetry text/meters. `render.js` never imports `ui.js`; the one-shot boot-sequence teardown on first frame is wired the other way — `main.js` calls `setOnFirstFrame(finishBoot)` to hook `ui.js`'s `finishBoot` into `render.js` without a circular import.

### Input (`js/ui.js`)
Pointer drag = orbit camera, scroll = dolly, click (solar system only) = pick a body (`pick()`), keyboard: `Tab`/`1`..`6` switch scenes, `H` toggles HUD, `R` resets, `T` guided tour, `U` unit toggle. Foldable HUD panels (`FOLDS`) auto-collapse on small/short viewports unless the user has manually toggled them.

Three cross-cutting controls live here:
- **Guided tour** (`TOUR`): a list of `[hash, heading, caption]` stops; each stop just sets the hash and lets `applyHash()` do the framing. Any pointer-down or nav click cancels it — the tour must never fight the user for the camera. It marks `<body class="touring">`, which is why `setScene()` manipulates `classList` rather than assigning `className`.
- **Snapshot** (`SNAPSHOT`): the PNG grab happens inside `render.js`'s `frame()` via `snapNextFrame(cb)`, not in the click handler. The context has no `preserveDrawingBuffer` (it costs frame time), so the back buffer is only readable in the same tick as the composite draw.
- **Unit toggle** (`UNITS`): `S.si` flips the camera-radius readout from each scene's natural unit to SI; the conversions live in `siRange()`/`fmtKm()` in `hud.js`. Scenes already quoted in real units (kpc, pc) are left alone.

## Conventions worth preserving

- No frameworks/bundler — plain ES modules, static hosting only.
- GLSL and JS share physical constants/formulas in comments (e.g. jet Doppler beaming, barycentre wobble, orbital eccentricity/inclination/node) — when tuning visuals, read the adjacent comment before changing a magic number, they usually explain the physical justification for it.
- CSS visibility for per-scene HUD elements is done via attribute/class selectors, not inline styles or JS `display` toggles — follow that pattern for new HUD elements so scene switching stays declarative.
- Keep the module boundaries above rather than growing one file back into a monolith — that's the whole point of the split.
