# TODO

Roadmap, in working order. Check items off as shipped.

## 1. Black hole scene
- [x] Binary black hole merger — second Schwarzschild horizon, orbiting, combined/mutual gravitational lensing (dual photon rings)
- [x] Accretion disk flare / instability event (timed brightness burst)

## 2. Milky Way scene
- [x] switching tabs between planets with up down or left right buttons
- [x] Satellite galaxies (LMC/SMC) as small smudges at the disk edge
- [x] M31 (Andromeda) visible in the distance — sets up the 4.5 Gyr collision the ticker already mentions

## 3. Solar System scene (more depth)
- [x] Pluto/Charon binary dwarf planet (mutual tidal lock)
- [x] Comet with dust + ion tail, always pointing away from Sun, on a wildly eccentric orbit
- [x] Earth day/night terminator + city lights on the dark side
- [ ] Clickable notable asteroids in the belt (Ceres, Vesta) — shape/texture done (ellipsoid + craters + Vesta's Rheasilvia basin), click-focus wired, but still reads as "small smooth moon" not "asteroid" at normal zoom. Cheap fix tried first: exaggerate ellipsoid squash + crater contrast. If still not enough, real fix is a small raymarched SDF for just these two (this scene is otherwise analytic-only, no march loop) — don't start until asked.
- [x] Make Saturn's rings more realistic (real band structure + ring shadow on the globe)
- [x] Make Pluto clickable (also added its orbit ring)

## 4. New scene tab
- [ ] Neutron star / pulsar — beamed lighthouse jets, magnetosphere
- [ ] Exoplanet system — transit method visual, habitable zone band
- [ ] Nebula / stellar nursery — protostars forming

## 5. Cross-cutting / UI
- [ ] Screenshot / share button
- [ ] Guided tour mode — auto-cycles scenes/foci with captions
- [ ] Unit toggle — show real AU/km alongside the compressed display values
