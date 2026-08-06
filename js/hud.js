/* ---------------- HUD telemetry ----------------
   updateHud() takes RW/RH/fps as arguments rather than importing them from
   render.js — render.js already needs updateHud, so importing render state
   back here would make the two modules circular for no real benefit. */
import { S, SCENES } from './state.js';
import { bodyRad, sunPos, FACTS, SUN_FACT, CERES_FACT, VESTA_FACT, PLUTO_FACT, ORB_RATE, SUN_R,
         XP_FACTS, XP_DAY_RATE, xpFlux } from './ephemeris.js';

const $ = id => document.getElementById(id);

/* the focused body's fact sheet. Ids: 8 = Sun, 20 = Pluto, 23/24 = Ceres/Vesta,
   0..7 = the planets in order. */
function focusFact(id){
  return (id === 8) ? SUN_FACT : (id === 20) ? PLUTO_FACT
       : (id === 23) ? CERES_FACT : (id === 24) ? VESTA_FACT : FACTS[id];
}

/* ---- UNITS toggle ----
   Most scenes quote the camera radius in the unit that scene is naturally
   measured in, which is the right default but hides the actual size of things.
   These map each scene's display radius to SI.

   R_S_SGRA:  Schwarzschild radius of a 4.297e6 M_sun black hole, 2GM/c^2.
   R_NS:      neutron star radius, ~12 km (FS_PULSAR's R_STAR).
   R_TR1:     TRAPPIST-1's radius, 0.1192 R_sun, in km.
   The solar system's radius is compressed as 4.6*a^0.48 (see orbR in
   ephemeris.js), so inverting that is what turns display units back into AU. */
const R_S_SGRA = 1.269e7;                 // km
const R_NS     = 12;                      // km
const R_TR1    = 0.1192 * 695700;          // km
const KM_PER_AU = 1.495979e8;

function fmtKm(km){
  if(km >= 1e9) return (km/1e9).toFixed(2) + ' Gkm';
  if(km >= 1e6) return (km/1e6).toFixed(2) + ' Mkm';
  if(km >= 1e3) return (km/1e3).toFixed(2) + ' Mm';
  return km.toFixed(1) + ' km';
}
/* null = this scene is already quoted in real units (kpc, pc), nothing to convert */
function siRange(scene, r){
  if(scene === 'bh') return fmtKm(r * R_S_SGRA);
  if(scene === 'ps') return fmtKm(r * R_NS);
  if(scene === 'xp') return fmtKm(r * R_TR1);
  if(scene === 'ss') return Math.pow(r/4.6, 1/0.48).toFixed(2) + ' AU';
  return null;
}

let hudT = 0;
export function updateHud(t, RW, RH, fps){
  if(t - hudT < 0.1) return; hudT = t;
  const r = S.dist;
  /* while tracking a body, distance is only meaningful in that body's radii */
  if(S.scene === 'ss' && S.focus >= 0){
    const F = focusFact(S.focus);
    const km = parseFloat(F.d.replace(/,/g,'')) / 2;      // FACTS quotes diameter
    $('t-rl').textContent = 'RANGE TO BODY';
    $('t-r').textContent  = S.si ? fmtKm(r/bodyRad(S.focus) * km)
                                 : (r/bodyRad(S.focus)).toFixed(2) + ' R';
  } else {
    const si = S.si ? siRange(S.scene, r) : null;
    $('t-rl').textContent = SCENES[S.scene].rlbl;
    $('t-r').textContent  = si || (r.toFixed(2) + SCENES[S.scene].runit);
  }
  /* FS_XP has no march loop at all — reporting a step count there would be a lie */
  $('t-s').textContent = (S.scene === 'xp') ? 'ANALYTIC' : S.steps;
  $('t-p').textContent = RW + '×' + RH;
  const fe = $('t-f'); fe.textContent = fps.toFixed(0) + ' FPS';
  fe.className = fps < 30 ? 'crit' : (fps < 50 ? 'warn' : '');

  const m = (S.scene === 'mw') ? hudGalaxy(t, r)
          : (S.scene === 'ss') ? hudSolar(t, r)
          : (S.scene === 'ps') ? hudPulsar(t, r)
          : (S.scene === 'nb') ? hudNebula(t, r)
          : (S.scene === 'xp') ? hudExo(t, r)
          : hudHole(t, r);
  for(let i=0;i<5;i++){
    const v = Math.max(0, Math.min(100, m[i]));
    $('m'+(i+1)).style.width = v.toFixed(1) + '%';
    $('m'+(i+1)+'v').textContent = v.toFixed(0) + '%';
  }
}

/* --- Milky Way readouts. Omega_p is the spiral pattern speed; the Sun sits near
   the corotation radius, so its orbital period is quoted against the pattern. --- */
function hudGalaxy(t, r){
  $('g-a').textContent = '2 + 2 MINOR';
  $('g-p').textContent = (Math.atan(1/2.55)*180/Math.PI).toFixed(1) + '°';
  $('g-o').textContent = (24.5*S.rot).toFixed(1) + ' km/s/kpc';
  $('g-d').textContent = (0.72*S.dust).toFixed(2) + ' mag/kpc';
  $('g-s').textContent = (226/Math.max(S.rot,0.05)).toFixed(0) + ' Myr';

  const link = $('t-l');
  if(r < 10){ link.textContent = 'INSIDE DISK'; link.className = 'crit'; }
  else if(r < 22){ link.textContent = 'GRAZING'; link.className = 'warn'; }
  else { link.textContent = 'STABLE'; link.className = ''; }

  return [
    S.arm*42 + 7*Math.sin(t*1.3),
    S.core*36 + 9*Math.sin(t*1.9),
    S.hii*44 + 8*Math.sin(t*2.1+0.7),
    S.dust*40 + 6*Math.sin(t*1.5+1.4),
    9 + 7*Math.abs(Math.sin(t*0.6))
  ];
}

/* --- Solar System readouts. The shader advances Earth's mean anomaly at
   0.55·uOrbit rad/s, so one Earth year is 2pi/(0.55·uOrbit) seconds of wall
   clock; every other period follows from Kepler's third law. --- */
function hudSolar(t, r){
  const yr = (2*Math.PI) / (ORB_RATE*Math.max(S.orbit, 1e-3));  // seconds per Earth year
  const rows = (S.focus < 0)
    ? [['BODIES TRACKED','8 + SUN'],
       ['EPOCH ELAPSED', (t/yr).toFixed(2) + ' yr'],
       ['MERCURY YEAR',  (yr*Math.pow(0.387,1.5)).toFixed(1) + ' s'],
       ['NEPTUNE YEAR',  (yr*Math.pow(30.07,1.5)).toFixed(0) + ' s'],
       /* the displayed radii are compressed; UNITS: SI swaps the exponent for
          the real span it stands in for */
       ['ORBIT SCALE',   S.si ? '0.387 – 30.07 AU' : 'a^0.48'],
       ['SUN OFF-CENTRE', (Math.hypot(...sunPos(t))/SUN_R).toFixed(2) + ' R☉']]
    : (function(){
        const F = focusFact(S.focus);
        return [['DIAMETER',      F.d],
                ['MASS',          F.m],
                ['SURFACE GRAV',  F.g],
                ['ROTATION',      F.day],
                ['ORBITAL PERIOD',F.yr],
                S.si ? ['SEMI-MAJOR AXIS', F.a] : ['MEAN TEMP', F.T]];
      })();
  for(let i=0;i<6;i++){
    $('p-l'+(i+1)).textContent = rows[i][0];
    $('p-v'+(i+1)).textContent = rows[i][1];
  }

  const link = $('t-l');
  if(S.focus >= 0){
    const R = bodyRad(S.focus);
    if(r < R*1.6){ link.textContent = 'SURFACE PROX'; link.className = 'crit'; }
    else { link.textContent = 'TRACKING'; link.className = 'warn'; }
  }
  else if(r < 8){ link.textContent = 'INSIDE ORBITS'; link.className = 'crit'; }
  else if(r < 26){ link.textContent = 'CLOSE PASS'; link.className = 'warn'; }
  else { link.textContent = 'STABLE'; link.className = ''; }

  return [
    S.sunl*40 + 6*Math.sin(t*1.7),
    S.orbit*26 + 8*Math.sin(t*1.1),
    S.path*32 + 5*Math.sin(t*2.4),
    S.belt*34 + 7*Math.abs(Math.sin(t*1.3)),
    8 + 6*Math.abs(Math.sin(t*0.6))
  ];
}

/* --- Pulsar readouts (PSR J0952-0607). The oblique-rotator model: the beam
   runs along the magnetic axis, tilted from the spin axis by psTilt, so BEAM
   PHASE tracks whether that axis currently points anywhere near the line of
   sight — that misalignment is the entire reason a pulsar pulses instead of
   just glowing steadily.

   Real spin period is 1.4137983550 ms and the light cylinder is c*P/2pi = 67 km
   = 5.6 stellar radii; the SPIN RATE slider scales both together, so the pair
   stays self-consistent at any setting. T_day tracks the ablation slider
   because that is the physical link — the day side is 6200 K precisely because
   the pulsar wind is depositing energy on it. --- */
function hudPulsar(t, r){
  const periodMs = 1.4138 / Math.max(S.psSpin, 0.05);
  $('ps-p').textContent = periodMs.toFixed(4) + ' ms';
  $('ps-o').textContent = (S.psTilt*180/Math.PI).toFixed(1) + '°';
  $('ps-l').textContent = (67/Math.max(S.psSpin, 0.05)).toFixed(1) + ' km';

  const phase = (t*S.psSpin*4) % (2*Math.PI);
  const pulsing = Math.abs(Math.cos(phase)) > 0.85;
  const pb = $('ps-b');
  pb.textContent = pulsing ? 'PULSE' : (phase*180/Math.PI).toFixed(0) + '°';
  pb.className = pulsing ? 'crit' : '';

  /* orbital phase: compPos() in FS_PULSAR sweeps at uTime*0.22 rad/s */
  const orb = ((t*0.22) % (2*Math.PI)) / (2*Math.PI);
  $('ps-r').textContent = (orb*360).toFixed(0) + '° / 6.419 h';
  const tday = 3000 + 3200*Math.min(S.psComp, 1.6)/1.0;
  $('ps-t').textContent = Math.round(Math.min(tday, 11000)) + ' K / 3000 K';

  const link = $('t-l');
  if(r < 5.6){ link.textContent = 'INSIDE LIGHT CYLINDER'; link.className = 'warn'; }
  else { link.textContent = 'STABLE'; link.className = ''; }

  return [
    S.psBeam*40 + 8*Math.abs(Math.sin(t*3.0)),
    S.psMag*36 + 7*Math.sin(t*1.6),
    S.psSpin*44 + 6*Math.sin(t*2.2),
    (S.psTilt/1.57)*100,
    S.psComp*38 + 6*Math.abs(Math.sin(t*0.9))
  ];
}

/* --- Nebula readouts. No body-select panel here (protostars aren't click-
   focusable), so unlike hudSolar/hudPulsar these numbers describe the whole
   cloud rather than a tracked body — NEAREST PROTOSTAR uses the closest of
   the 5 fixed PROTO_POS entries baked into FS_NEBULA (nearest is index 0,
   |pos| ≈ 3.93 pc from the cloud centre), so its range is the camera radius
   minus that — good enough while the camera always looks at the centre. --- */
function hudNebula(t, r){
  $('nb-d').textContent = (0.55*S.nbDensity + 0.10*Math.sin(t*0.4)).toFixed(2);
  const active = S.nbProto > 0.03 ? 5 : 0;
  $('nb-p').textContent = active + ' / 5';
  const je = $('nb-j');
  if(S.nbJet < 0.02){ je.textContent = 'DORMANT'; je.className = ''; }
  else { je.textContent = 'BIPOLAR ACTIVE'; je.className = 'warn'; }
  $('nb-n').textContent = (Math.abs(r - 3.93) + 0.4*Math.sin(t*0.25)).toFixed(2) + ' pc';

  const link = $('t-l');
  if(r < 18){ link.textContent = 'IN CLOUD CORE'; link.className = 'warn'; }
  else { link.textContent = 'STABLE'; link.className = ''; }

  return [
    S.nbDensity*40 + 8*Math.sin(t*0.8),
    S.nbProto*42 + 7*Math.sin(t*1.4+0.3),
    S.nbJet*36 + 9*Math.abs(Math.sin(t*2.0)),
    30 + 10*Math.sin(t*0.5+1.1),
    10 + 8*Math.abs(Math.sin(t*0.6))
  ];
}

/* --- Exoplanet readouts + the transit light curve. This is the actual transit
   method: you never see the planet, you see the star get 0.34%-0.76% fainter on
   schedule. The trace is xpFlux() sampled over a rolling window, so what the
   plot shows and what the scene draws are the same seven orbits. Depths use the
   real radius ratios even though the drawn planets are ~3x oversized; durations
   follow the scene's compressed orbits, see xpFlux(). --- */
const LC_SPAN = 20;              // seconds of history shown

function hudExo(t, r){
  const f = xpFlux(t);
  $('xp-f').textContent = (f*100).toFixed(3) + ' %';

  /* which planets are actually crossing the disc right now */
  const inT = XP_FACTS.filter(P => {
    const ang = t * S.xpOrb * XP_DAY_RATE * 2*Math.PI / P.P;
    return Math.sin(ang) > 0 && Math.abs(Math.cos(ang)) * 1.0 < 0.14;
  }).map(P => P.n);
  const te = $('xp-t');
  te.textContent = inT.length ? inT.join(' + ').toUpperCase() : '—';
  te.className = inT.length ? 'crit' : '';

  $('xp-h').textContent = 'e · f · g';
  $('xp-y').textContent = (XP_FACTS[0].P / Math.max(S.xpOrb, 0.05) / XP_DAY_RATE).toFixed(2) + ' s / 1.51 d';
  $('xp-d').textContent = 'g · ' + (XP_FACTS[5].rk**2*100).toFixed(2) + ' %';

  const link = $('t-l');
  if(r < 16){ link.textContent = 'INSIDE ORBITS'; link.className = 'warn'; }
  else { link.textContent = 'STABLE'; link.className = ''; }

  drawLightCurve(t);

  return [
    S.xpLum*44 + 5*Math.sin(t*1.1),
    S.xpOrb*38 + 6*Math.sin(t*1.6),
    (3/7)*100,
    (1 - f)*100/0.0076*38,          // current depth against the deepest transit
    6 + 5*Math.abs(Math.sin(t*0.7))
  ];
}

/* The curve is evaluated across the window every draw rather than accumulated
   from one sample per HUD tick. xpFlux() is closed-form, so this costs one pixel
   column each and is both cheaper and correct: the HUD ticks at 10 Hz while an
   inner transit lasts a fraction of a second, so a sampled buffer aliased the
   ingress into noise spikes. */
function drawLightCurve(t){
  const cv = $('lc'); if(!cv) return;
  const c = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  c.clearRect(0,0,W,H);

  /* flux axis: 1.0 at the top, a touch below the deepest transit at the bottom */
  const lo = 0.9905, hi = 1.0012;
  const y = v => H - (v - lo)/(hi - lo)*H;

  c.strokeStyle = 'rgba(120,180,220,0.16)'; c.lineWidth = 1;
  [1.0, 0.995].forEach(v => {
    c.beginPath(); c.moveTo(0, y(v)); c.lineTo(W, y(v)); c.stroke();
  });
  c.fillStyle = 'rgba(150,200,230,0.45)';
  c.font = '8px ui-monospace, monospace';
  c.fillText('1.000', 2, y(1.0) - 2);
  c.fillText('0.995', 2, y(0.995) - 2);

  c.strokeStyle = 'rgba(90,220,255,0.95)'; c.lineWidth = 1.4;
  c.beginPath();
  for(let x=0; x<W; x++){
    const v = y(xpFlux(t - LC_SPAN*(1 - x/(W-1))));
    if(x === 0) c.moveTo(0, v); else c.lineTo(x, v);
  }
  c.stroke();
}

function hudHole(t, r){
  const gz = 1/Math.sqrt(Math.max(1 - 1/r, 1e-4));   // 1+z
  const dil= Math.sqrt(Math.max(1 - 1/r, 1e-4));
  const T  = 2.1e7 * Math.pow(S.disk+0.05, 0.25);

  $('t-z').textContent = (gz-1).toFixed(4);
  $('t-d').textContent = dil.toFixed(4) + ' ×';
  $('t-t').textContent = (T/1e6).toFixed(2) + ' MK';

  /* jet kinematics: theta is the angle between the jet axis and the line of
     sight, so cos(theta) = sin(pitch). beta_app = b sin0 / (1 - b cos0) is the
     apparent transverse speed — it reads superluminal near theta ~ acos(b). */
  const b = 0.93, gm = 1/Math.sqrt(1-b*b);
  const ct = Math.sin(S.pitch), st = Math.sqrt(Math.max(1-ct*ct, 0));
  const bapp = b*st / Math.max(1 - b*Math.abs(ct), 1e-3);
  $('t-g').textContent = gm.toFixed(2);
  const be = $('t-b');
  be.textContent = bapp.toFixed(2) + ' c';
  be.className = bapp > 1 ? 'warn' : '';
  const je = $('t-j');
  if(S.jet < 0.02){ je.textContent = 'DORMANT'; je.className = ''; }
  else { je.textContent = (S.pitch >= 0 ? 'NORTH +y' : 'SOUTH −y'); je.className = 'warn'; }

  const cm = $('t-cm');
  /* 0.004 matches FS_SCENE's own `uComp > 0.004` activation threshold — a
     slightly higher cutoff here read as "stuck at NONE" for a first small
     slider nudge, since the effect (and this readout) hadn't gone live yet. */
  if(S.comp < 0.004){ cm.textContent = 'NONE'; cm.className = ''; }
  else { cm.textContent = S.comp.toFixed(2) + ' M_prim @ ' + S.sep.toFixed(1) + ' r_s'; cm.className = 'warn'; }

  /* mirrors the ~9s flare cycle computed in FS_SCENE (uTime*0.11) */
  const fl = $('t-fl');
  if(S.flare < 0.004){ fl.textContent = 'DORMANT'; fl.className = ''; }
  else {
    const cyc = (t*0.11) % 1;
    const env = Math.min(1, cyc/0.015) * Math.exp(-cyc*20);
    if(env > 0.05){ fl.textContent = 'FLARING ' + (env*S.flare).toFixed(2); fl.className = 'crit'; }
    else { fl.textContent = 'QUIESCENT'; fl.className = ''; }
  }

  const link = $('t-l');
  if(r < 6){ link.textContent = 'TIDAL STRESS'; link.className = 'crit'; }
  else if(r < 10){ link.textContent = 'DEGRADED'; link.className = 'warn'; }
  else { link.textContent = 'STABLE'; link.className = ''; }

  return [
    100/Math.max(r-0.9,0.4) * 3.2 * S.lens,
    S.disk*33 + 8*Math.sin(t*1.7),
    S.dopp*46 + 6*Math.sin(t*2.3+1.0),
    S.jet*38 + 11*Math.abs(Math.sin(t*1.15)),
    12 + 9*Math.abs(Math.sin(t*0.6))
  ];
}
