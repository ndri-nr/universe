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
export function bodyPos(id, t){ return id === 8 ? sunPos(t) : planetPos(id, t); }
export function bodyRad(id){ return id === 8 ? SUN_R : P_RAD[id]; }

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

/* ---------------- deep links ----------------
   #bh, #mw, #ss, #ss/saturn — the body slug lives here since it's really part
   of the planet catalogue, not the routing logic itself (ui.js owns that). */
export const BODY_SLUG = ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'];
export function slugFor(id){ return id === 8 ? 'sun' : (id >= 0 ? BODY_SLUG[id] : null); }
export function idForSlug(s){
  if(s === 'sun') return 8;
  const i = BODY_SLUG.indexOf(s);
  return i >= 0 ? i : -1;
}
