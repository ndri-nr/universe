/* ---------------- HUD telemetry ----------------
   updateHud() takes RW/RH/fps as arguments rather than importing them from
   render.js — render.js already needs updateHud, so importing render state
   back here would make the two modules circular for no real benefit. */
import { S, SCENES } from './state.js';
import { bodyRad, sunPos, FACTS, SUN_FACT, CERES_FACT, VESTA_FACT, PLUTO_FACT, ORB_RATE, SUN_R } from './ephemeris.js';

const $ = id => document.getElementById(id);

let hudT = 0;
export function updateHud(t, RW, RH, fps){
  if(t - hudT < 0.1) return; hudT = t;
  const r = S.dist;
  /* while tracking a body, distance is only meaningful in that body's radii */
  if(S.scene === 'ss' && S.focus >= 0){
    $('t-rl').textContent = 'RANGE TO BODY';
    $('t-r').textContent  = (r/bodyRad(S.focus)).toFixed(2) + ' R';
  } else {
    $('t-rl').textContent = SCENES[S.scene].rlbl;
    $('t-r').textContent  = r.toFixed(2) + SCENES[S.scene].runit;
  }
  $('t-s').textContent = S.steps;
  $('t-p').textContent = RW + '×' + RH;
  const fe = $('t-f'); fe.textContent = fps.toFixed(0) + ' FPS';
  fe.className = fps < 30 ? 'crit' : (fps < 50 ? 'warn' : '');

  const m = (S.scene === 'mw') ? hudGalaxy(t, r)
          : (S.scene === 'ss') ? hudSolar(t, r)
          : (S.scene === 'ps') ? hudPulsar(t, r)
          : (S.scene === 'nb') ? hudNebula(t, r)
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
       ['ORBIT SCALE',   'a^0.48'],
       ['SUN OFF-CENTRE', (Math.hypot(...sunPos(t))/SUN_R).toFixed(2) + ' R☉']]
    : (function(){
        const F = (S.focus === 8) ? SUN_FACT
                : (S.focus === 20) ? PLUTO_FACT
                : (S.focus === 23) ? CERES_FACT
                : (S.focus === 24) ? VESTA_FACT
                : FACTS[S.focus];
        return [['DIAMETER',      F.d],
                ['MASS',          F.m],
                ['SURFACE GRAV',  F.g],
                ['ROTATION',      F.day],
                ['ORBITAL PERIOD',F.yr],
                ['MEAN TEMP',     F.T]];
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
  if(r < 13){ link.textContent = 'IN CLOUD CORE'; link.className = 'warn'; }
  else { link.textContent = 'STABLE'; link.className = ''; }

  return [
    S.nbDensity*40 + 8*Math.sin(t*0.8),
    S.nbProto*42 + 7*Math.sin(t*1.4+0.3),
    S.nbJet*36 + 9*Math.abs(Math.sin(t*2.0)),
    30 + 10*Math.sin(t*0.5+1.1),
    10 + 8*Math.abs(Math.sin(t*0.6))
  ];
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
