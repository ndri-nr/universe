# Singularity Observatory

Raymarched WebGL2 visualizer — Schwarzschild black hole (Sgr A*), the Milky Way, and the Solar System — no libraries, no build step, ES modules.

**Live:** https://ndri-nr.github.io/universe/

## Controls

- Drag = orbit camera, scroll = zoom
- Click a body (Solar System scene) = focus on it
- `Tab` / `1` `2` `3` = switch scene
- `H` = toggle HUD, `R` = reset

## Run locally

Must be served over http — ES modules are blocked by CORS on `file://`, so double-clicking `index.html` won't work:

```bash
python -m http.server 8000   # then open http://localhost:8000
```
