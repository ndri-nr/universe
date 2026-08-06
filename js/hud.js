/* ---------------- HUD telemetry ----------------
   updateHud() takes RW/RH/fps as arguments rather than importing them from
   render.js — render.js already needs updateHud, so importing render state
   back here would make the two modules circular for no real benefit. */
import { S, SCENES } from './state.js';
import { bodyRad, sunPos, FACTS, SUN_FACT, CERES_FACT, VESTA_FACT, ORB_RATE, SUN_R } from './ephemeris.js';

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
