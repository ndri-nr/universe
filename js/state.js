/* ---------------- shared state ----------------
   S is the one global mutable blob: camera, per-scene slider values, which
   scene/body is active, quality level. SCENES holds each scene's static
   camera framing + HUD copy. QUALITY holds the render-scale/step presets.
   Every other module imports S/SCENES/QUALITY from here rather than owning
   its own copy — this file has no imports of its own, so it's always safe
   to import from anywhere without creating a cycle. */

export const S = {
  yaw: 0.62, pitch: 0.26, dist: 23.0,
  tYaw: 0.62, tPitch: 0.26, tDist: 23.0,
  auto: true, hud: true, quality: 2,
  disk: 1.15, lens: 1.0, spin: 1.0, dopp: 1.0, bloom: 1.05, star: 1.0, jet: 1.0,
  comp: 0.0, sep: 8.0, flare: 1.0,
  arm: 1.0, dust: 1.0, core: 1.0, hii: 1.0, rot: 1.0,
  orbit: 1.0, sunl: 1.0, path: 1.0, detail: 1.0, belt: 1.0, bary: 0.0, smark: 1.0,
  psSpin: 1.0, psBeam: 1.0, psMag: 1.0, psTilt: 0.65,
  nbDensity: 1.0, nbProto: 1.0, nbJet: 1.0,
  scene: 'bh', scale: 0.9, steps: 300,
  focus: -1,            // -1 = whole system, 0..7 = planet, 8 = Sun
  zoomed: false,        // user has zoomed manually: suppress auto re-framing
  tgt: [0,0,0]          // eased look-at point, so refocusing flies rather than cuts
};

/* per-scene camera framing and HUD copy */
export const SCENES = {
  bh: {
    dist: 23.0, pitch: 0.26, min: 4.6, max: 60,
    lbl: 'deep field observatory // node-07',
    h1:  'SGR A*',
    sub: 'SCHWARZSCHILD CLASS &middot; M = 4.297e6 M<sub>&#9737;</sub>',
    rlbl:'OBS RADIUS', runit:' r_s', slbl:'PHOTON STEPS',
    meters:['GRAVITATIONAL FLUX','ACCRETION LUMINOSITY','DOPPLER BEAMING',
            'JET COLLIMATION','HAWKING NOISE FLOOR'],
    tick:'◆ GRAVITATIONAL WAVE DETECTOR ONLINE ◆ EVENT HORIZON RADIUS 1.27e10 M ◆ ACCRETION RATE 1.4e-8 M⊙/YR '
        +'◆ PHOTON SPHERE LOCKED AT 1.5 R_S ◆ ISCO STABLE ◆ RELATIVISTIC JET: ACTIVE · Γ=2.72 · β=0.93c '
        +'◆ SYNCHROTRON LOBES BEAMED ALONG SPIN AXIS ◆ SPACETIME CURVATURE MAPPED VIA NULL GEODESIC INTEGRATION '
        +'◆ WARNING: DO NOT CROSS R &lt; 3 R_S ◆'
  },
  mw: {
    dist: 74.0, pitch: 0.42, min: 8.0, max: 220,
    lbl: 'wide field survey // node-07',
    h1:  'MILKY WAY',
    sub: 'SBbc BARRED SPIRAL &middot; R = 26.8 kpc',
    rlbl:'VIEW DISTANCE', runit:' kpc', slbl:'MARCH STEPS',
    meters:['ARM CONTRAST','DISK LUMINOSITY','STAR FORMATION',
            'DUST EXTINCTION','HALO NOISE FLOOR'],
    tick:'◆ WIDE FIELD SURVEY ONLINE ◆ STELLAR POPULATION 1.5e11 ◆ BARYONIC MASS 6.4e10 M⊙ '
        +'◆ SGR A* AT GALACTIC CENTRE ◆ SUN AT R = 8.2 kpc · ORBITAL PERIOD 226 Myr '
        +'◆ FOUR ARMS: PERSEUS · NORMA · SCUTUM-CENTAURUS · SAGITTARIUS '
        +'◆ DUST LANES TRACED BY VOLUMETRIC EXTINCTION ◆ LOGARITHMIC SPIRAL PITCH 21.4° '
        +'◆ COLLISION WITH M31 IN 4.5 Gyr ◆'
  },
  ss: {
    dist: 64.0, pitch: 0.52, min: 3.0, max: 200,
    lbl: 'orbital mechanics // node-07',
    h1:  'SOLAR SYSTEM',
    sub: '8 PLANETS &middot; G2V PRIMARY &middot; a = 0.39 &ndash; 30.07 AU',
    rlbl:'VIEW DISTANCE', runit:' AU*', slbl:'TRACE STEPS',
    meters:['SOLAR IRRADIANCE','ORBITAL COHERENCE','EPHEMERIS LOCK',
            'BELT DENSITY','BACKGROUND NOISE'],
    tick:'◆ EPHEMERIS LOCKED ◆ 8 PLANETS · 5 DWARF PLANETS · 1.1e6 CATALOGUED MINOR BODIES '
        +'◆ ORBITAL RADII COMPRESSED AS a^0.48 FOR FRAMING · PERIODS REMAIN KEPLERIAN T ∝ a^1.5 '
        +'◆ MERCURY 88 d · NEPTUNE 60190 d ◆ ASTEROID BELT 2.2 &ndash; 3.2 AU '
        +'◆ SATURN RING SYSTEM: CASSINI DIVISION RESOLVED ◆ HELIOPAUSE AT 123 AU ◆'
  },
  ps: {
    dist: 14.0, pitch: 0.32, min: 3.0, max: 40,
    lbl: 'timing array // node-07',
    h1:  'PSR J0002+66',
    sub: 'OBLIQUE ROTATOR &middot; P = 115 ms &middot; B = 1.2e8 T',
    rlbl:'OBS RADIUS', runit:' r_ns', slbl:'MARCH STEPS',
    meters:['BEAM LUMINOSITY','MAGNETOSPHERE DENSITY','SPIN RATE',
            'MAGNETIC OBLIQUITY','TIMING NOISE FLOOR'],
    tick:'◆ TIMING ARRAY LOCKED ◆ SPIN PERIOD 115 ms · SLOWING 1.4e-15 s/s ◆ SURFACE FIELD 1.2e8 T '
        +'◆ MAGNETIC AXIS OBLIQUE TO SPIN AXIS — THE OBLIQUE ROTATOR IS WHY IT PULSES AT ALL '
        +'◆ LIGHT CYLINDER RADIUS 5,480 km ◆ TWIN LIGHTHOUSE BEAMS ALONG THE MAGNETIC POLES '
        +'◆ DISPERSION MEASURE 116.5 pc·cm&#8315;&sup3; ◆ CLASSIFIED: ROTATION-POWERED PULSAR ◆'
  },
  nb: {
    dist: 20.0, pitch: 0.30, min: 4.0, max: 40,
    lbl: 'infrared survey // node-07',
    h1:  'NGC 6611-B',
    sub: 'H II EMISSION NEBULA &middot; 5 PROTOSTARS &middot; R &asymp; 26 pc',
    rlbl:'OBS RADIUS', runit:' pc', slbl:'MARCH STEPS',
    meters:['CLOUD DENSITY','PROTOSTAR LUMINOSITY','JET ACTIVITY',
            'DUST EXTINCTION','BACKGROUND NOISE'],
    tick:'◆ INFRARED SURVEY ONLINE ◆ STELLAR NURSERY · 5 PROTOSTARS CATALOGUED ◆ H-ALPHA / OIII DUAL BAND '
        +'◆ DUST LANES ABSORBING VISIBLE LIGHT ◆ BIPOLAR JETS ALONG ACCRETION AXES ◆ '
        +'GRAVITATIONAL COLLAPSE ONGOING &middot; FUTURE OB ASSOCIATION ◆ '
        +'RADIATION PRESSURE SCULPTING PILLARS ◆ CLASSIFIED: DIFFUSE EMISSION NEBULA ◆'
  }
};

export const QUALITY = [
  {name:'LOW',    scale:0.55, steps:150},
  {name:'MEDIUM', scale:0.75, steps:220},
  {name:'HIGH',   scale:0.95, steps:300},
  {name:'ULTRA',  scale:1.00, steps:420}
];

/* Whether the pointer is currently dragging the camera. Lives here (rather
   than as a local in ui.js) because render.js's frame() needs to read it
   every tick to suppress auto-orbit while the user is dragging, and both
   modules already depend on state.js — putting it here avoids making
   render.js and ui.js import each other just for one flag. */
export let dragging = false;
export function setDragging(v){ dragging = v; }
