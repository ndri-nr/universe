/* ---------------- planetary ephemeris ----------------
   Mirrors the constants in FS_SS (shaders.js) exactly. If one side changes,
   the other must too — this is what click-picking and camera focus are
   resolved against. */
import { S } from './state.js';

export const P_AU  = [0.387, 0.723, 1.000, 1.524, 5.203, 9.537, 19.19, 30.07];
/* Mercury..Mars halved from 0.26/0.40/0.42/0.32 — must match RAD in FS_SS
   exactly, see the comment there (real eccentricity + the original radii
   meant every adjacent inner-planet pair's spheres overlapped every orbit). */
export const P_RAD = [0.13,  0.20,  0.21,  0.16,  0.92,  0.80,  0.60,  0.58];
export const P_PH0 = [0.90,  2.30,  0.40,  3.90,  1.60,  5.10,  2.80,  4.40];
/* real eccentricities/inclinations/nodes — must match ECC/INC/NODE in FS_SS
   exactly, same reason as the rest of this block: camera focus and
   click-picking are resolved against this JS copy, so it has to trace the
   same tilted ellipse. */
export const P_ECC  = [0.2056, 0.0068, 0.0167, 0.0934, 0.0489, 0.0565, 0.0457, 0.0113];
export const P_INC  = [0.12228,0.05926,0.0,    0.03229,0.02275,0.04337,0.01347,0.03087];
export const P_NODE = [0.8436, 1.3384, 0.0,    0.8650, 1.7537, 1.9840, 1.2919, 2.2996];
export const SUN_R = 1.50;

export const ORB_RATE = 0.16;          // must match ORB_RATE in FS_SS

export function orbR(i){ return 4.6 * Math.pow(P_AU[i], 0.48); }
export function planetPos(i, t){
  const m  = t * Math.pow(P_AU[i], -1.5) * ORB_RATE * S.orbit;
  const nu = P_PH0[i] + m;
  const e  = P_ECC[i];
  const R  = orbR(i) * (1 - e*e) / (1 + e*Math.cos(m));
  const cn = Math.cos(P_NODE[i]), sn = Math.sin(P_NODE[i]);
  const ci = Math.cos(P_INC[i]),  si = Math.sin(P_INC[i]);
  const cu = Math.cos(nu), su = Math.sin(nu);
  const ux=cn, uy=0, uz=sn;
  const wx=-sn*ci, wy=si, wz=cn*ci;
  return [R*(cu*ux+su*wx), R*(cu*uy+su*wy), R*(cu*uz+su*wz)];
}
/* --- the Sun's own orbit about the Solar System barycentre ---
   r_sun = -(Σ mᵢ rᵢ)/M_sun. In reality the Sun–Jupiter barycentre lies about
   1.07 solar radii from the Sun's centre — just *outside* its surface — so the
   Sun visibly circles a point near its own limb. Here orbital radii are
   compressed (a^0.48) while the Sun's radius is not, which shrinks the true
   wobble to 0.6% of its radius. BARY_EXAG restores the real 1.07 R☉ ratio for
   Jupiter alone, so what you see is the correct relationship, scaled up. */
export const P_MASS    = [0.055, 0.815, 1.000, 0.107, 317.8, 95.2, 14.5, 17.1];  // M⊕
export const M_SUN     = 333000;                                                  // M⊕
export const BARY_EXAG = 165;

export function sunPos(t){
  let x=0, y=0, z=0;
  for(let i=0;i<8;i++){
    const p = planetPos(i, t), m = P_MASS[i];
    x += m*p[0]; y += m*p[1]; z += m*p[2];
  }
  const k = -BARY_EXAG * S.bary / M_SUN;
  return [x*k, y*k, z*k];
}
/* generic tilted-ellipse position — must match smallBodyPos() in FS_SS
   exactly. Used for the notable asteroids (ids 23/24) below; extend here
   rather than adding another bespoke function if more small bodies join. */
export function smallBodyPos(au, ecc, inc, node, ph0, t){
  const orbRb = 4.6 * Math.pow(au, 0.48);
  const m  = t * Math.pow(au, -1.5) * ORB_RATE * S.orbit;
  const nu = ph0 + m;
  const R  = orbRb * (1 - ecc*ecc) / (1 + ecc*Math.cos(m));
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(inc),  si = Math.sin(inc);
  const cu = Math.cos(nu), su = Math.sin(nu);
  return [R*(cu*cn+su*(-sn*ci)), R*(su*si), R*(cu*sn+su*(cn*ci))];
}
/* Ceres/Vesta — must match the CERES_ and VESTA_ consts in FS_SS exactly */
/* RAD here is the mean of the ellipsoid semi-axes in FS_SS's CERES_RAD/
   VESTA_RAD (vec3) — close enough for pick radius/focus framing, which
   don't need per-axis precision */
const CERES_AU=2.77, CERES_ECC=0.076, CERES_INC=0.185, CERES_NODE=1.40, CERES_PH0=1.1, CERES_RAD=0.051;
const VESTA_AU=2.36, VESTA_ECC=0.089, VESTA_INC=0.124, VESTA_NODE=2.62, VESTA_PH0=4.0, VESTA_RAD=0.039;
/* Pluto — must match the PLUTO_ consts in FS_SS exactly. Charon (id 21)
   isn't click-focusable — Pluto's barycentre-orbit position stands in for
   both, same as how Sun-focus doesn't track its own tiny wobble either. */
const PLUTO_AU=39.5, PLUTO_ECC=0.248, PLUTO_INC=0.2995, PLUTO_NODE=1.925, PLUTO_PH0=2.0, PLUTO_RAD=0.10;

export function plutoBaryPos(t){
  return smallBodyPos(PLUTO_AU, PLUTO_ECC, PLUTO_INC, PLUTO_NODE, PLUTO_PH0, t);
}

export function bodyPos(id, t){
  if(id === 8)  return sunPos(t);
  if(id === 20) return plutoBaryPos(t);
  if(id === 23) return smallBodyPos(CERES_AU, CERES_ECC, CERES_INC, CERES_NODE, CERES_PH0, t);
  if(id === 24) return smallBodyPos(VESTA_AU, VESTA_ECC, VESTA_INC, VESTA_NODE, VESTA_PH0, t);
  return planetPos(id, t);
}
export function bodyRad(id){
  if(id === 8)  return SUN_R;
  if(id === 20) return PLUTO_RAD;
  if(id === 23) return CERES_RAD;
  if(id === 24) return VESTA_RAD;
  return P_RAD[id];
}

/* observed values; moon counts are the confirmed tallies and do drift upward */
export const FACTS = [
  {n:'MERCURY', d:'4,879 km',     m:'0.055 M⊕', g:'3.70 m/s²',  day:'58.6 d',      yr:'88.0 d',    mo:'0',   T:'+167 °C', a:'0.387 AU'},
  {n:'VENUS',   d:'12,104 km',    m:'0.815 M⊕', g:'8.87 m/s²',  day:'243 d retro', yr:'224.7 d',   mo:'0',   T:'+464 °C', a:'0.723 AU'},
  {n:'EARTH',   d:'12,742 km',    m:'1.000 M⊕', g:'9.81 m/s²',  day:'23.93 h',     yr:'365.25 d',  mo:'1',   T:'+15 °C',  a:'1.000 AU'},
  {n:'MARS',    d:'6,779 km',     m:'0.107 M⊕', g:'3.72 m/s²',  day:'24.62 h',     yr:'687 d',     mo:'2',   T:'−63 °C',  a:'1.524 AU'},
  {n:'JUPITER', d:'139,820 km',   m:'317.8 M⊕', g:'24.79 m/s²', day:'9.93 h',      yr:'11.86 yr',  mo:'95',  T:'−108 °C', a:'5.203 AU'},
  {n:'SATURN',  d:'116,460 km',   m:'95.2 M⊕',  g:'10.44 m/s²', day:'10.66 h',     yr:'29.45 yr',  mo:'274', T:'−139 °C', a:'9.537 AU'},
  {n:'URANUS',  d:'50,724 km',    m:'14.5 M⊕',  g:'8.87 m/s²',  day:'17.24 h',     yr:'84.0 yr',   mo:'28',  T:'−197 °C', a:'19.19 AU'},
  {n:'NEPTUNE', d:'49,244 km',    m:'17.1 M⊕',  g:'11.15 m/s²', day:'16.11 h',     yr:'164.8 yr',  mo:'16',  T:'−201 °C', a:'30.07 AU'}
];
export const SUN_FACT = {n:'SUN', d:'1,391,400 km', m:'333,000 M⊕', g:'274 m/s²',
                  day:'25.4 d equator', yr:'—', mo:'8 planets', T:'5,772 K', a:'0 AU'};
/* the belt's two biggest — Ceres is large enough to be a dwarf planet in its
   own right, Vesta the brightest asteroid as seen from Earth */
export const CERES_FACT = {n:'CERES', d:'940 km', m:'0.00016 M⊕', g:'0.27 m/s²',
                  day:'9.07 h', yr:'4.60 yr', mo:'0', T:'−105 °C', a:'2.77 AU'};
export const VESTA_FACT = {n:'VESTA', d:'525 km', m:'0.00004 M⊕', g:'0.25 m/s²',
                  day:'5.34 h', yr:'3.63 yr', mo:'0', T:'−96 °C',  a:'2.36 AU'};
export const PLUTO_FACT = {n:'PLUTO', d:'2,377 km', m:'0.0022 M⊕', g:'0.62 m/s²',
                  day:'6.39 d', yr:'248 yr', mo:'5', T:'−229 °C', a:'39.5 AU'};

/* ---------------- TRAPPIST-1 (exoplanet scene) ----------------
   Agol et al. 2021 / Gillon et al. 2017. P_DAY and ORB here must match P_DAY
   and P_ORB in FS_XP exactly — same rule as the solar system block above, since
   the transit light curve is computed here while the picture is drawn there.

   RK is the REAL radius ratio R_planet/R_star, which is what sets transit
   depth (depth = RK^2, i.e. 0.34%-0.76% here). The shader draws the planets
   about 3x oversized for visibility; the light curve does not, so the depths it
   plots are the true ones. R_star = 0.1192 R_sun, R_earth/R_sun = 0.009168. */
export const XP_STAR = {n:'TRAPPIST-1', cls:'M8V ultracool dwarf', T:'2,566 K',
                        m:'0.0898 M☉', rad:'0.1192 R☉', L:'0.000553 L☉',
                        d:'40.66 ly (12.47 pc)', con:'Aquarius', age:'7.6 Gyr'};
export const XP_FACTS = [
  {n:'b', P:1.510826,  au:0.01154, re:1.116, rk:0.0858, hz:false, T:'+126 °C'},
  {n:'c', P:2.421937,  au:0.01580, re:1.097, rk:0.0844, hz:false, T:'+65 °C'},
  {n:'d', P:4.049219,  au:0.02227, re:0.788, rk:0.0606, hz:false, T:'−9 °C'},
  {n:'e', P:6.101013,  au:0.02925, re:0.920, rk:0.0708, hz:true,  T:'−22 °C'},
  {n:'f', P:9.207540,  au:0.03849, re:1.045, rk:0.0804, hz:true,  T:'−54 °C'},
  {n:'g', P:12.352446, au:0.04683, re:1.129, rk:0.0868, hz:true,  T:'−75 °C'},
  {n:'h', P:18.772866, au:0.06189, re:0.755, rk:0.0581, hz:false, T:'−104 °C'}
];
export const XP_ORB   = [4.00, 5.65, 7.55, 9.20, 11.20, 12.85, 15.90]; // = P_ORB in FS_XP
export const XP_DAY_RATE = 0.6;                                        // = DAY_RATE in FS_XP

/* Transit flux at time t, seen from a fixed direction in the orbital plane
   (+z here, matching the shader's xz orbit plane). A planet transits when it is
   on the near side and its projected offset from the stellar disc centre is
   under R_star + R_planet; the smoothstep across that window is the ingress and
   egress ramp. Real transits have a limb-darkened, near-flat floor, which this
   approximates rather than integrates. Impact parameter is taken as 0 — the
   real ones are small and all seven do transit, which is why the system was
   found by transit photometry in the first place.

   What is real here and what is not: the DEPTHS are real, because they come from
   the true radius ratios. The DURATIONS are stretched by the same a^0.62 orbital
   compression the scene is drawn with — geometrically a real TRAPPIST-1b transit
   covers 1.7% of its orbit and would be under a pixel wide on this plot, so the
   curve is deliberately consistent with the picture above it rather than with
   the sky. */
export function xpFlux(t){
  let f = 1.0;
  for(let i=0;i<XP_FACTS.length;i++){
    const P = XP_FACTS[i], k = P.rk;
    const ang = t * S.xpOrb * XP_DAY_RATE * 2*Math.PI / P.P;
    const x = Math.cos(ang), z = Math.sin(ang);
    if(z <= 0) continue;                        // far side: occultation, not transit
    const sep = Math.abs(x) * XP_ORB[i];        // projected offset in display units
    const sepR = sep / 1.2;                     // ...in stellar radii (R_STAR = 1.2)
    const cov = 1.0 - smooth01(sepR, 1.0 - k, 1.0 + k);
    f -= cov * k * k;
  }
  return f;
}
function smooth01(x, a, b){
  const u = Math.min(Math.max((x - a)/(b - a), 0), 1);
  return u*u*(3 - 2*u);
}

/* ---------------- deep links ----------------
   #bh, #mw, #ss, #ss/saturn — the body slug lives here since it's really part
   of the planet catalogue, not the routing logic itself (ui.js owns that). */
export const BODY_SLUG = ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'];
export function slugFor(id){
  if(id === 8)  return 'sun';
  if(id === 20) return 'pluto';
  if(id === 23) return 'ceres';
  if(id === 24) return 'vesta';
  return id >= 0 ? BODY_SLUG[id] : null;
}
export function idForSlug(s){
  if(s === 'sun')   return 8;
  if(s === 'pluto') return 20;
  if(s === 'ceres') return 23;
  if(s === 'vesta') return 24;
  const i = BODY_SLUG.indexOf(s);
  return i >= 0 ? i : -1;
}
