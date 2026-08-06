# Singularity Observatory

WebGL2 visualizer — no libraries, no build step, ES modules. Six scenes:

- **Sgr A\*** — Schwarzschild black hole, null geodesics integrated per pixel
- **Milky Way** — barred spiral with volumetric dust lanes, LMC/SMC and M31
- **Solar System** — eight planets on real eccentric, inclined orbits, plus Pluto, Ceres, Vesta and a comet
- **PSR J0952−0607** — the fastest and heaviest known neutron star, eating its companion
- **Stellar nursery** — H II emission nebula with dust pillars and embedded protostars
- **TRAPPIST-1** — seven planets, habitable zone band, live transit light curve

**Live:** https://ndri-nr.github.io/universe/

## Controls

- Drag = orbit camera, scroll = zoom
- Click a body (Solar System scene) = focus on it
- `Tab` / `1`–`6` = switch scene, `←` `→` = cycle body
- `T` = guided tour, `U` = toggle SI units
- `H` = toggle HUD, `R` = reset
- `SNAPSHOT` saves a PNG, `COPY LINK` copies a deep link to the current view

Scenes deep-link: `#bh`, `#mw`, `#ss`, `#ss/saturn`, `#ps`, `#nb`, `#xp`.

## Accuracy

Figures in the HUD are real published values. Where geometry had to be
compressed or exaggerated to fit a frame — orbital radii, the pulsar's binary
separation, its beam sweep rate — the code comments say so at the point it
happens, and the readouts still quote the true numbers.

## Run locally

Must be served over http — ES modules are blocked by CORS on `file://`, so double-clicking `index.html` won't work:

```bash
python -m http.server 8000   # then open http://localhost:8000
```
