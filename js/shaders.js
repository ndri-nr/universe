/* ============================================================
   SINGULARITY OBSERVATORY — shader sources
   Raymarched Schwarzschild black hole — raw WebGL2, no libs.
   Null geodesics integrated in Cartesian coords (r_s = 1):
       d²x/dλ² = -3/2 · h² · x / r⁵ ,  h² = |x × v|²

   Adding a new scene: write FS_YOURSCENE = GLSL_HEAD + `...` below, add its
   camera framing/HUD copy to SCENES in state.js, then wire it into render.js
   (program select + uniform block in frame()) and ui.js (nav button + any
   scene-specific controls in index.html use data-sc="yourscene" already).
   ============================================================ */

export const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

/* Shared GLSL prelude: both scene shaders declare the same camera/time uniforms
   and reuse the same procedural noise and deep-field starfield. */
export const GLSL_HEAD = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCam;
uniform mat3  uCamMat;
uniform int   uSteps;
uniform float uStar;

const int MAXS = 460;

/* ---- hashes / noise ---- */
float h13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.yzx+33.33); return fract((p.x+p.y)*p.z); }
vec3  h33(vec3 p){ p = fract(p*vec3(0.1031,0.1030,0.0973)); p += dot(p, p.yxz+33.33);
                   return fract((p.xxy+p.yxx)*p.zyx); }

float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = mix(mix(h13(i+vec3(0,0,0)), h13(i+vec3(1,0,0)), f.x),
                mix(h13(i+vec3(0,1,0)), h13(i+vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(h13(i+vec3(0,0,1)), h13(i+vec3(1,0,1)), f.x),
                mix(h13(i+vec3(0,1,1)), h13(i+vec3(1,1,1)), f.x), f.y);
  return mix(a,b,f.z);
}
float fbm(vec3 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + vec3(1.7,9.2,3.4); a *= 0.5; }
  return s;
}

/* ---- procedural deep field ---- */
float starLayer(vec3 d, float scale, float thr, float sz){
  vec3 p  = d*scale;
  vec3 id = floor(p);
  vec3 gv = fract(p) - 0.5;
  vec3 o  = (h33(id+7.13) - 0.5) * 0.78;
  float b = h13(id + 21.71);
  if(b < thr) return 0.0;
  float dist = length(gv - o);
  float tw = 0.62 + 0.38*sin(uTime*(1.4 + b*5.0) + b*39.0);
  float core = smoothstep(sz, 0.0, dist);
  return pow(core, 3.2) * pow((b-thr)/(1.0-thr), 2.0) * tw;
}
vec3 deepField(vec3 d){
  vec3 c = vec3(0.0);
  float s1 = starLayer(d, 62.0, 0.955, 0.085);
  float s2 = starLayer(d, 128.0, 0.972, 0.070);
  float s3 = starLayer(d, 250.0, 0.984, 0.055);
  vec3 t1 = vec3(0.72,0.86,1.00);
  vec3 t2 = vec3(1.00,0.94,0.86);
  vec3 t3 = vec3(0.86,0.90,1.00);
  c += s1*t1*2.6 + s2*t2*1.7 + s3*t3*1.1;

  /* nebula veils */
  float n  = fbm(d*2.1 + vec3(0.0, uTime*0.004, 0.0));
  float n2 = fbm(d*4.6 + 11.0);
  vec3 neb = mix(vec3(0.055,0.020,0.115), vec3(0.010,0.070,0.125), n2);
  c += neb * pow(smoothstep(0.48,1.10,n), 2.2) * 0.85;

  /* faint galactic band */
  float band = exp(-pow(d.y*2.6,2.0)) * (0.32 + 0.68*fbm(d*7.0));
  c += vec3(0.016,0.022,0.042) * band;
  return c * uStar;
}
`;

/* ============================ SCENE A: BLACK HOLE ============================ */
export const FS_SCENE = GLSL_HEAD + `
uniform float uLens, uDisk, uSpin, uDopp, uJet;
/* companion black hole for a binary-merger view. uComp IS the companion's
   Schwarzschild radius in the same r_s=1 units as the primary (so it's both
   "how big is its horizon" and "how hard does it pull" — physically these
   are the same number). uComp=0 collapses this exactly back to the single
   black hole case: its force term and horizon test both vanish. */
uniform float uComp, uSep;
/* Real Sgr A* flares roughly daily via magnetic reconnection in the
   accretion flow, and VLTI/GRAVITY observations show the emission during a
   flare tracking a compact hot spot orbiting near the ISCO — that's the
   model reproduced below, not just a blanket brightness pulse. */
uniform float uFlare;

const float RS   = 1.0;          // event horizon
const float PHOT = 1.5;          // photon sphere
const float RIN  = 2.9;          // inner disk edge (~ISCO)
const float ROUT = 9.6;          // outer disk edge
const float JET_BASE = 1.15;     // jet launch height above/below the hole
const float JET_LEN  = 46.0;     // jet reach

/* ---- accretion disk colour ramp (temperature) ---- */
vec3 diskRamp(float t){
  vec3 white = vec3(1.10,1.26,1.60);   // innermost: relativistic blue-white
  vec3 blue  = vec3(0.62,0.92,1.62);
  vec3 gold  = vec3(1.62,0.98,0.30);
  vec3 amber = vec3(1.42,0.44,0.07);
  vec3 deep  = vec3(0.62,0.10,0.02);   // cool outer rim
  if(t < 0.13) return mix(white, blue, t/0.13);
  if(t < 0.40) return mix(blue,  gold, (t-0.13)/0.27);
  if(t < 0.76) return mix(gold,  amber,(t-0.40)/0.36);
  return mix(amber, deep, (t-0.76)/0.24);
}

/* ---- relativistic jet: optically-thin synchrotron plasma along the spin axis ----
   Sampled volumetrically at every geodesic step, so the counter-jet gets lensed
   around the shadow for free. Returns emission (density already folded in);
   the caller multiplies by dt, so undersampled steps still integrate correctly. */
vec3 jetEmission(vec3 p, vec3 rdir){
  if(uJet <= 0.004) return vec3(0.0);
  float ay = abs(p.y);
  if(ay < JET_BASE || ay > JET_LEN) return vec3(0.0);       // outside the funnel
  float rho = length(p.xz);
  float rj  = 0.30 + 0.30*sqrt(ay);                         // parabolic collimation
  if(rho > rj*2.2) return vec3(0.0);                         // cheap early-out

  /* radial profile: hot spine + brighter magnetic sheath at the walls */
  float x      = rho / rj;
  float spine  = exp(-x*x*1.7);
  float sheath = exp(-pow((x-0.74)*2.7, 2.0)) * 0.9;
  float radial = spine*0.8 + sheath;

  /* launch ramp near the base, then power-law decay outward */
  float lon = smoothstep(JET_BASE, JET_BASE+1.5, ay) * pow(1.0/(1.0 + ay*0.155), 1.45);

  /* helical magnetic field — twist unwinds as the flow expands */
  float ph    = atan(p.z, p.x);
  float tw    = ph - ay*0.52 + uTime*uSpin*1.15;
  float helix = 0.52 + 0.48*cos(2.0*tw);

  /* internal shocks: knots propagating outward on both jets (ay is |y|) */
  float knot = 0.55 + 1.05*pow(max(sin(ay*0.85 - uTime*uSpin*2.4), 0.0), 7.0);

  /* turbulence in the co-moving frame */
  float turb = 0.5 + 0.95*vnoise(vec3(p.xz*1.7, ay*0.85 - uTime*uSpin*1.7));

  float dens = radial * lon * helix * knot * turb;
  if(dens <= 0.0) return vec3(0.0);

  /* --- relativistic beaming ---
     bulk flow is outward along the jet at beta, so the Doppler factor is
     delta = 1/(gamma(1 - beta cos0)) against the line of sight to the observer.
     Physical intensity goes as delta^3, but at our default 75 deg viewing angle
     that dims the jet ~7x into invisibility. We keep the angular *shape* of the
     Doppler factor and drop the exponent to 1.6, which preserves the
     jet/counter-jet asymmetry while staying on screen. */
  const float beta = 0.93;
  vec3  nob  = -normalize(rdir);                            // toward the observer
  float cth  = sign(p.y) * nob.y;
  float D    = 1.0 / (1.0 - beta*cth);                      // = delta * gamma
  float beam = mix(1.0, clamp(pow(D, 1.6), 0.18, 14.0), clamp(uDopp*0.7, 0.0, 1.0));

  /* synchrotron colour: white-hot at the base, electric blue to violet outward,
     shifted bluer where the flow is beamed toward us */
  vec3 c = mix(vec3(0.30,0.60,1.60), vec3(0.92,0.38,1.42), turb*0.5);
  c = mix(vec3(1.20,1.30,1.62), c, smoothstep(JET_BASE, 6.5, ay));
  c = mix(c, c*vec3(0.72,0.94,1.45), clamp((D-1.0)*0.45, 0.0, 0.55));

  /* gravitational redshift at the launch point */
  float grav = sqrt(max(1.0 - RS/max(length(p), RS*1.02), 0.05));

  return c * dens * beam * grav * uJet * 0.45;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;

  /* ray setup */
  vec3 rd = normalize(uCamMat * vec3(uv, -1.45));
  vec3 pos = uCam;
  vec3 dir = rd;

  /* per-pixel jitter: sliding the origin along the ray is exactly the same null
     line, so h2 is unchanged — it just dithers step phase and kills the
     concentric banding the log-spaced disk noise would otherwise alias into. */
  float jit = h13(vec3(gl_FragCoord.xy, floor(uTime*24.0)));
  pos += dir * jit * 0.55;

  vec3  hv  = cross(pos, dir);
  float h2  = dot(hv, hv);

  /* companion's orbital position — fixed for the whole march (it barely moves
     across one ray's integration), recomputed fresh next frame via uTime */
  float cAng = uTime * uSpin * 0.12 + 0.7;
  vec3  cPos = vec3(cos(cAng), 0.0, sin(cAng)) * uSep;
  bool  binary = uComp > 0.004;

  vec3  col   = vec3(0.0);
  float trans = 1.0;
  float glow  = 0.0;
  bool  eaten = false;

  int steps = uSteps;
  for(int i=0;i<MAXS;i++){
    if(i >= steps) break;
    float r = length(pos);
    if(r < RS){ eaten = true; break; }
    if(binary && length(pos - cPos) < uComp){ eaten = true; break; }
    if(r > 70.0 && dot(pos,dir) > 0.0) break;
    if(trans < 0.004) break;

    /* adaptive affine step */
    float dt = clamp(0.055*(r-0.93), 0.0075, 0.85);

    /* the step grows with r, which would smear the jet's helix at large |y|;
       keep it fine while the ray is anywhere near the funnel */
    float ayq = abs(pos.y);
    if(uJet > 0.004 && ayq < JET_LEN && length(pos.xz) < (0.30 + 0.30*sqrt(ayq))*2.3)
      dt = min(dt, 0.42);

    /* photon-ring halo accumulation */
    glow += dt * 0.0080 / (abs(r - PHOT) + 0.34) / (1.0 + 0.06*r*r);
    if(binary){
      float rB = length(pos - cPos);
      glow += dt * 0.0080 * uComp / (abs(rB - 1.5*uComp) + 0.34) / (1.0 + 0.06*rB*rB);
    }

    /* RK2 integration of the null geodesic */
    vec3 a1 = -1.5 * h2 * pos / pow(r,5.0) * uLens;
    if(binary){
      /* the companion isn't at the origin, so its specific angular momentum
         about itself is NOT conserved along the ray the way h2 is for the
         primary — recompute it fresh at each stage from the current local
         position/direction. Cheap (one extra cross+dot) and correct enough
         for a visual binary-lensing effect, not a full two-body geodesic
         solver (which has no closed form anyway). */
      vec3  relA = pos - cPos;
      float rA   = max(length(relA), uComp*0.85);
      vec3  hvB  = cross(relA, dir);
      a1 += -1.5 * uComp * dot(hvB,hvB) * relA / pow(rA,5.0) * uLens;
    }
    vec3 pm = pos + dir*dt*0.5;
    vec3 dm = dir + a1*dt*0.5;
    float rm = max(length(pm), RS*0.85);
    vec3 a2 = -1.5 * h2 * pm / pow(rm,5.0) * uLens;
    if(binary){
      vec3  relB = pm - cPos;
      float rB2  = max(length(relB), uComp*0.85);
      vec3  hvB2 = cross(relB, dm);
      a2 += -1.5 * uComp * dot(hvB2,hvB2) * relB / pow(rB2,5.0) * uLens;
    }

    vec3 prev = pos;
    dir += a2*dt;
    pos += dm*dt;

    /* jet is emissive and optically thin: add, don't attenuate. sampling at the
       RK2 midpoint keeps it aligned with the segment we just traversed. */
    col += trans * jetEmission(pm, dm) * dt;

    /* --- thin disk crossing (equatorial plane y = 0) --- */
    if(prev.y*pos.y < 0.0){
      float k   = prev.y / (prev.y - pos.y);
      vec3  hit = mix(prev, pos, clamp(k,0.0,1.0));
      float rh  = length(hit.xz);
      if(rh > RIN && rh < ROUT){
        float u   = (rh - RIN) / (ROUT - RIN);
        float ang = atan(hit.z, hit.x);

        /* keplerian shear: inner rings sweep faster */
        float orb = uTime * uSpin * 1.9 * pow(rh, -1.5) * 12.0;
        float a   = ang + orb;

        /* turbulent spiral filaments in co-rotating frame */
        vec2  q  = vec2(cos(a), sin(a));
        float rj = log(rh) + (jit - 0.5) * 0.055;      // dithered radial coord
        float n1 = fbm(vec3(q * (2.4 + rh*0.30), rj*2.6) * 1.35);
        float n2 = fbm(vec3(q * (7.0 + rh*0.55), rj*5.5) * 1.15 + 31.0);
        float fil = mix(n1, n2, 0.45);
        float streak = 0.18 + 2.05*pow(clamp(fil,0.0,1.0), 2.4);

        /* radial density profile — sharp inner cutoff, soft outer fade */
        float dens = smoothstep(0.0,0.075,u) * smoothstep(1.0,0.42,u) * streak;

        /* emissivity ~ r^-2.4 (hot inner annulus) */
        float emis = dens * pow(RIN/rh, 2.4) * 5.4;

        /* relativistic beaming + gravitational redshift */
        vec3  vel  = normalize(cross(vec3(0.0,1.0,0.0), hit)) * (0.62/sqrt(max(rh,1.05)));
        float dop  = 1.0 / max(1.0 - dot(vel, -normalize(dm)), 0.22);
        float beam = mix(1.0, pow(clamp(dop,0.32,3.1), 3.0), clamp(uDopp,0.0,2.0));
        float grav = sqrt(max(1.0 - RS/rh, 0.02));

        vec3  c = diskRamp(clamp(u*0.94 + 0.03, 0.0, 1.0));
        c = mix(c, c*vec3(0.74,0.92,1.42), clamp((dop-1.0)*0.55*uDopp, 0.0, 0.62)); // blueshift
        c = mix(c, c*vec3(1.35,0.62,0.34), clamp((1.0-dop)*0.85*uDopp, 0.0, 0.70)); // redshift

        float alpha = clamp(emis*0.30, 0.0, 1.0);
        col   += trans * c * emis * beam * grav * uDisk * 0.105;

        /* ---- flare: fast-rise/exponential-decay burst from a hot spot
           orbiting just outside the ISCO, repeating on a cycle ---- */
        if(uFlare > 0.004){
          float rHot   = RIN + 0.6;
          float wHot   = uSpin * 1.9 * pow(rHot, -1.5) * 12.0;
          float hotAng = uTime * wHot + 1.3;
          float dAng   = mod(ang - hotAng + 3.14159265, 6.2831853) - 3.14159265;
          float spot   = exp(-dAng*dAng*9.0) * exp(-pow((rh-rHot)*2.0, 2.0));
          float cyc    = fract(uTime * 0.11);                    // ~9s between onsets
          float env    = smoothstep(0.0, 0.015, cyc) * exp(-cyc*20.0);
          float flare  = spot * env * uFlare * 55.0;
          /* distinctly whiter/hotter than diskRamp's own innermost colour, so
             the burst reads as a flash against the disk instead of just a
             brighter patch of the same hue */
          col += trans * vec3(1.85,1.95,2.20) * flare * beam * grav * uDisk;
        }

        trans *= (1.0 - alpha*0.86);
      }
    }
  }

  if(!eaten) col += trans * deepField(normalize(dir));

  /* photon ring / lensing halo — captured rays keep only a faint rim so the
     shadow stays genuinely black instead of fogging over */
  float gw = eaten ? 0.14 : 1.0;
  glow *= gw;
  col += glow * vec3(1.00,0.66,0.30) * (0.85 + 0.55*uDisk);
  col += glow*glow * vec3(0.45,0.72,1.00) * 0.55;

  outColor = vec4(max(col, 0.0), 1.0);
}`;

/* ============================ SCENE B: MILKY WAY ============================
   Volumetric emission/absorption march through a barred spiral. The arms are a
   logarithmic spiral density wave (phi + k·ln r = const), which is what gives a
   real galaxy its constant pitch angle. Dust lanes sit slightly inward of each
   arm ridge and are integrated as true absorption, so arms in front genuinely
   occlude the bulge behind them. */
export const FS_MW = GLSL_HEAD + `
uniform float uArm, uDust, uCore, uHII, uRot, uSMark;

const float R_EDGE = 21.0;       // optical radius of the disk
const float R_HALO = 27.0;       // marching bound
/* The Sun orbits Sgr A* at R = 8.2 kpc, one galactic year every ~226 Myr.
   21 units spans the 26.8 kpc optical disc, so 8.2 kpc lands at 6.43 units. */
const float R_SUN_GAL = 6.43;

/* ---- satellite galaxies + Andromeda ----
   These sit at effective infinity — fixed sky directions, like the deep-field
   starfield, not points inside the disk march. LMC/SMC are real near-sky
   neighbours (rendered close together, as they really are); M31 sets up the
   4.5 Gyr collision the ticker already mentions. Each is a soft angular
   Gaussian textured with fbm so it reads as a clumpy dwarf/spiral smudge
   rather than a flat disc. */
vec3 satBlob(vec3 rd, vec3 dir, float rad, vec3 tint, float texScale, float bright){
  float ang = acos(clamp(dot(rd, dir), -1.0, 1.0));
  float core = exp(-(ang*ang)/(rad*rad));
  if(core < 0.0008) return vec3(0.0);
  vec3 tp = normalize(cross(dir, vec3(0.0,1.0,0.0)));
  vec3 bp = cross(dir, tp);
  vec3 t  = rd - dir*dot(rd,dir);
  float u = dot(t, tp) / rad, v = dot(t, bp) / rad;
  float clump = 0.5 + 0.5*fbm(vec3(u, v, 0.0)*texScale + 4.0);
  return tint * bright * core * (0.55 + 0.65*clump);
}

/* emission at p; also returns the local absorption coefficient */
vec3 galaxy(vec3 p, out float ab){
  ab = 0.0;
  float rho = length(p.xz);
  if(rho > R_EDGE && abs(p.y) > 3.0) return vec3(0.0);

  /* disk: exponential in radius, sech-like in height, flaring outward */
  float h      = 0.26 + 0.048*rho;
  float vert   = exp(-abs(p.y)/h);
  float radial = exp(-rho/6.6) * smoothstep(0.0, 1.5, rho);

  /* logarithmic spiral: four major arms at their real, UNEVEN angular spacing
     (Norma · Scutum-Centaurus · Sagittarius · Perseus are not 90° apart), each
     its own ridge rather than one cos(2a)/cos(4a) harmonic — a single harmonic
     always reads as "two strong, two faint" no matter the mix weight, which
     undersells the arm count. Plus a short Orion-type spur peeling off one arm. */
  float ph = atan(p.z, p.x) + uTime*uRot*0.030;
  float a  = ph + log(max(rho, 0.4)) * 2.55;      // 2.55 = 1/tan(pitch angle)
  float ridgePow = mix(1.2, 4.6, clamp(uArm*0.5, 0.0, 1.0));
  float arms = 0.0;
  arms = max(arms, pow(max(cos(a - 0.00), 0.0), ridgePow));
  arms = max(arms, pow(max(cos(a - 1.75), 0.0), ridgePow));
  arms = max(arms, pow(max(cos(a - 3.30), 0.0), ridgePow));
  arms = max(arms, pow(max(cos(a - 4.95), 0.0), ridgePow));
  float spur = pow(max(cos(a - 2.55), 0.0), ridgePow*1.8)
             * smoothstep(4.5,7.5,rho) * (1.0-smoothstep(9.0,12.0,rho));
  arms = clamp(max(arms, spur*0.55), 0.0, 1.0);

  /* clumping, carried around on a flat rotation curve (differential shear) */
  float om = 1.7 * pow(max(rho, 0.7), -0.55) * uRot;
  float sa = ph + om*uTime*0.30;
  float cl = fbm(vec3(cos(sa)*rho, p.y*2.4, sin(sa)*rho) * 0.52);

  float dens = vert * radial * (0.13 + 1.25*arms) * (0.42 + 0.90*cl);

  /* central bar + bulge: an elongated spheroid of old, redder stars */
  vec3  bp   = vec3(p.x*0.50, p.y*2.5, p.z*1.40);
  float bar  = exp(-dot(bp,bp)*0.20);
  float rr   = length(vec3(p.x, p.y*2.3, p.z));
  float bulge= exp(-rr*rr*0.085);

  /* populations: blue OB associations ride the arms, old yellow stars elsewhere */
  vec3 c = mix(vec3(1.32,1.00,0.56), vec3(0.52,0.72,1.40), clamp(arms*0.88, 0.0, 0.9));
  c = mix(c, vec3(1.48,1.06,0.50), clamp(bar*2.0, 0.0, 0.88));

  /* HII regions: pink star-forming knots on the arm ridges */
  float hii = pow(max(cl-0.60, 0.0)*2.7, 2.0) * arms;
  c += vec3(1.70,0.30,0.62) * hii * uHII * 1.6;

  /* resolved stellar granularity, so the disk reads as stars and not smooth fog */
  float spark = pow(max(vnoise(p*6.5 + 17.0) - 0.56, 0.0) * 2.9, 3.0);

  float emit = dens*0.42 + spark*dens*1.30 + (bar*0.95 + bulge*0.25) * uCore;

  /* dust lanes trail just inside each arm ridge — same four phases, offset by
     the same 0.44 rad the old single-harmonic version used */
  float lane = 0.0;
  lane = max(lane, pow(max(cos(a - 0.00 - 0.44), 0.0), 3.5));
  lane = max(lane, pow(max(cos(a - 1.75 - 0.44), 0.0), 3.5));
  lane = max(lane, pow(max(cos(a - 3.30 - 0.44), 0.0), 3.5));
  lane = max(lane, pow(max(cos(a - 4.95 - 0.44), 0.0), 3.5));
  ab = (dens*1.05 + lane*vert*radial*2.5) * uDust * 0.60;

  return c * emit;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  vec3 rd = normalize(uCamMat * vec3(uv, -1.45));

  vec3  col   = vec3(0.0);
  float trans = 1.0;

  /* march only the slab of space the galaxy actually occupies */
  float b    = dot(uCam, rd);
  float cc   = dot(uCam, uCam) - R_HALO*R_HALO;
  float disc = b*b - cc;
  if(disc > 0.0){
    float sq = sqrt(disc);
    float t0 = max(-b - sq, 0.0);
    float t1 = -b + sq;
    int   ns = min(uSteps, 168);
    float dt = (t1 - t0) / float(ns);
    float jit = h13(vec3(gl_FragCoord.xy, floor(uTime*24.0)));
    float t = t0 + dt*jit;
    for(int i=0;i<MAXS;i++){
      if(i >= ns || trans < 0.003) break;
      float ab;
      /* dither each sample within its own slab: uniform spacing otherwise lays
         down visible layer bands wherever the density gradient is steep */
      float d2 = h13(vec3(gl_FragCoord.xy, float(i) + jit*13.0)) - 0.5;
      vec3 em = galaxy(uCam + rd*(t + dt*d2*0.9), ab);
      col   += trans * em * dt;
      trans *= exp(-ab*dt);
      t     += dt;
    }
  }

  /* --- the Sun's galactic orbit, drawn where the ray crosses the mid-plane.
     Scaled by trans so dust lanes in front of it correctly hide it. --- */
  if(uSMark > 0.004 && abs(rd.y) > 1e-4){
    float tp = -uCam.y / rd.y;
    if(tp > 0.0){
      vec2  q = (uCam + rd*tp).xz;
      float d = length(q);
      /* the orbital track */
      col += vec3(0.28,0.78,1.00) * (0.0075/(abs(d - R_SUN_GAL) + 0.055)) * uSMark * trans;
      /* and the Sun on it — one lap per galactic year */
      float ga = uTime*uRot*0.021 + 2.1;
      float ds = length(q - vec2(cos(ga), sin(ga))*R_SUN_GAL);
      col += vec3(1.00,0.94,0.68) * (0.0090/(ds*ds + 0.0035)) * uSMark * trans;
    }
  }

  col += satBlob(rd, normalize(vec3( 0.58,-0.34, 0.74)), 0.075, vec3(0.80,0.84,0.98), 6.0, 0.85) * trans; // LMC
  col += satBlob(rd, normalize(vec3( 0.52,-0.30, 0.80)), 0.045, vec3(0.78,0.82,0.95), 7.0, 0.55) * trans; // SMC
  col += satBlob(rd, normalize(vec3(-0.739,-0.330,-0.587)), 0.085, vec3(0.92,0.86,0.78), 5.0, 0.65) * trans; // M31

  col += trans * deepField(rd);
  outColor = vec4(max(col, 0.0), 1.0);
}`;

/* =========================== SCENE C: SOLAR SYSTEM ==========================
   Analytic ray/sphere intersection — sharp planets for a fraction of the cost of
   a volumetric march. Orbital radii are compressed (r ~ a^0.48) so Mercury and
   Neptune fit one frame, but the angular speeds stay Keplerian (w ~ a^-1.5), so
   the relative motion is real: Mercury laps Neptune ~685 times. Light falloff is
   deliberately gentler than inverse-square, or the outer planets would be black. */
export const FS_SS = GLSL_HEAD + `
uniform float uOrbit, uSunL, uPath, uDetail, uBelt;
/* The Sun is NOT fixed: it orbits the Solar System barycentre, which sits at the
   origin here. Position is computed on the CPU from the mass-weighted planet
   positions and passed in, so lighting, the corona and click-picking all agree. */
uniform vec3  uSunPos;

const float SUN_R = 1.50;
const float AU[8]   = float[8](0.387, 0.723, 1.000, 1.524, 5.203, 9.537, 19.19, 30.07);
/* Mercury..Mars are HALVED from their originally-chosen 0.26/0.40/0.42/0.32 —
   at real scale, those combined with real eccentricity meant every adjacent
   pair's spheres (Mercury-Venus, Venus-Earth, Earth-Mars) genuinely overlap
   at closest approach in this compressed-orbit system, i.e. planets visibly
   merging every orbit, not a rare edge case. Verified via the same
   min-distance-over-many-years numeric sweep used for the moon-orbit safety
   values below: every pair now clears with >=15% margin. Mirrored in JS as
   P_RAD in ephemeris.js. */
const float RAD[8]  = float[8](0.13,  0.20,  0.21,  0.16,  0.92,  0.80,  0.60,  0.58);
const float PH0[8]  = float[8](0.90,  2.30,  0.40,  3.90,  1.60,  5.10,  2.80,  4.40);
/* real orbital eccentricities, ecliptic inclinations, and longitudes of
   ascending node (all radians) — Mercury is both the most eccentric AND the
   most tilted, Neptune is nearly flat and nearly circular. NODE is the
   direction each orbital plane tilts around: without it every inclined
   orbit leans the same way (around the x-axis) and only differs in how
   much, which reads as "everything tilts on one hinge". Real planets tilt
   around different lines entirely, scattered ~0-360°. Mirrored in JS as
   P_ECC/P_INC/P_NODE in ephemeris.js. */
const float ECC[8]  = float[8](0.2056, 0.0068, 0.0167, 0.0934, 0.0489, 0.0565, 0.0457, 0.0113);
const float INC[8]  = float[8](0.12228,0.05926,0.0,    0.03229,0.02275,0.04337,0.01347,0.03087);
const float NODE[8] = float[8](0.8436, 1.3384, 0.0,    0.8650, 1.7537, 1.9840, 1.2919, 2.2996);
const float SATR    = 12.40;   // Saturn's compressed orbital radius (index 5)

float orbR(int i){ return 4.6 * pow(AU[i], 0.48); }

/* Earth's mean motion in rad/s at uOrbit = 1. Kept slow because periods are
   Keplerian: at 0.55 Mercury's year was 2.75 s, far too fast to look at (and
   faster than any camera tracking could follow). Mirrored in JS as ORB_RATE. */
const float ORB_RATE = 0.16;

vec3 planetPos(int i){
  float m   = uTime * pow(AU[i], -1.5) * ORB_RATE * uOrbit;   // anomaly progress since t=0
  float nu  = PH0[i] + m;                                     // in-plane angle
  /* true ellipse, periapsis at m=0 (i.e. at each planet's own PH0 direction):
     r = a_semi(1-e^2)/(1+e*cos m). Replaces the old perfect circle. */
  float R   = orbR(i) * (1.0 - ECC[i]*ECC[i]) / (1.0 + ECC[i]*cos(m));
  /* orbital-plane basis: u is the line of nodes (where the tilted plane
     crosses the ecliptic), w is u rotated 90° within the plane and lifted
     out of the ecliptic by INC. Both hinge on NODE[i], so each planet tilts
     around its own line, not a shared one. */
  float cn = cos(NODE[i]), sn = sin(NODE[i]);
  float ci = cos(INC[i]),  si = sin(INC[i]);
  vec3  u  = vec3(cn, 0.0, sn);
  vec3  w  = vec3(-sn*ci, si, cn*ci);
  return R * (cos(nu)*u + sin(nu)*w);
}

float iSphere(vec3 ro, vec3 rd, vec3 ce, float ra){
  vec3 oc = ro - ce;
  float b = dot(oc, rd), c = dot(oc,oc) - ra*ra;
  float h = b*b - c;
  if(h < 0.0) return -1.0;
  return -b - sqrt(h);
}
/* ray/ellipsoid intersection: rescale space by 1/radii so the ellipsoid
   becomes a unit sphere, solve there, scale the root back. Used for
   Ceres/Vesta below — a perfect sphere reads as "mini smooth planet", not
   an asteroid; real Vesta especially is visibly lumpy (a huge impact basin
   flattens one pole). No raymarch needed, still a closed-form quadratic. */
float iEllipsoid(vec3 ro, vec3 rd, vec3 ce, vec3 radii){
  vec3 oc = (ro - ce) / radii;
  vec3 rdn = rd / radii;
  float a = dot(rdn, rdn);
  float b = dot(oc, rdn);
  float c = dot(oc, oc) - 1.0;
  float h = b*b - a*c;
  if(h < 0.0) return -1.0;
  return (-b - sqrt(h)) / a;
}
/* surface normal of that same ellipsoid at point p — gradient of
   ((p-ce)/radii)^2 = 1, i.e. (p-ce)/radii^2 */
vec3 ellipsoidNormal(vec3 p, vec3 ce, vec3 radii){
  return normalize((p - ce) / (radii*radii));
}

/* per-planet surface albedo, sampled in a slowly spinning body frame.
   emissive is light the surface itself puts out — city lights on Earth's
   night side — as opposed to sunlight it reflects, which is why it's a
   separate out-param rather than baked into the returned albedo: the caller
   only wants it added where dif (sunlight) is near zero. Every other planet
   just leaves it black. */
vec3 surface(int id, vec3 n, out vec3 emissive){
  emissive = vec3(0.0);
  float sp = uTime * (0.22 + 0.05*float(8-id)) * uOrbit;
  float cs = cos(sp), sn = sin(sp);
  vec3 q = vec3(n.x*cs - n.z*sn, n.y, n.x*sn + n.z*cs);
  float lat = q.y;
  float d = clamp(uDetail, 0.0, 2.0);

  if(id == 0){                                    /* Mercury: cratered regolith */
    float c = fbm(q*7.5);
    return mix(vec3(0.36,0.33,0.31), vec3(0.62,0.57,0.52), mix(0.5, c, d));
  }
  if(id == 1){                                    /* Venus: opaque cloud deck */
    float b = fbm(vec3(q.x*3.0, lat*7.0, q.z*3.0));
    return mix(vec3(0.86,0.76,0.55), vec3(0.99,0.94,0.78), mix(0.5, b, d));
  }
  if(id == 2){                                    /* Earth: oceans, land, ice, cloud */
    float land = fbm(q*3.3);
    vec3 c = (land > 0.52)
      ? mix(vec3(0.13,0.32,0.11), vec3(0.44,0.37,0.21), smoothstep(0.52,0.74,land))
      : mix(vec3(0.01,0.07,0.26), vec3(0.04,0.19,0.46), clamp(land*1.7,0.0,1.0));
    c = mix(c, vec3(0.92,0.96,1.00), smoothstep(0.70,0.86, abs(lat)));
    float cloud = smoothstep(0.54,0.80, fbm(q*4.8 + vec3(uTime*0.02,0.0,0.0)));
    /* city lights: small warm clusters, land only, dimmed under cloud cover
       (from orbit, clouds really do hide city glow) — the caller masks this
       to the night side, so it only shows up once the terminator crosses it */
    float cities = pow(max(fbm(q*13.0 + 7.0) - 0.63, 0.0) * 2.8, 2.0);
    float onLand  = smoothstep(0.52, 0.60, land);
    emissive = vec3(1.00,0.82,0.45) * cities * onLand * (1.0 - cloud*0.75) * 0.95;
    return mix(c, vec3(0.96,0.98,1.00), cloud*0.55*d);
  }
  if(id == 3){                                    /* Mars: rust, maria, polar caps */
    float m = fbm(q*5.0);
    vec3 c = mix(vec3(0.52,0.22,0.11), vec3(0.86,0.46,0.26), mix(0.5, m, d));
    return mix(c, vec3(0.93,0.94,0.96), smoothstep(0.80,0.93, abs(lat)));
  }
  if(id == 4){                                    /* Jupiter: bands + red spot */
    float turb = fbm(vec3(q.x*2.2, lat*9.0, q.z*2.2));
    float band = sin(lat*15.0 + turb*2.6*d);
    vec3 c = mix(vec3(0.55,0.40,0.27), vec3(0.96,0.88,0.74), 0.5+0.5*band);
    float sx = atan(q.z, q.x) - 1.10, sy = (lat + 0.24)*2.8;
    c = mix(c, vec3(0.82,0.33,0.18), exp(-dot(vec2(sx,sy),vec2(sx,sy))*7.0)*0.9);
    return c;
  }
  if(id == 5){                                    /* Saturn: soft pale bands */
    float turb = fbm(vec3(q.x*2.0, lat*8.0, q.z*2.0));
    float band = sin(lat*12.0 + turb*1.8*d);
    return mix(vec3(0.72,0.62,0.44), vec3(0.98,0.92,0.74), 0.5+0.5*band);
  }
  if(id == 6){                                    /* Uranus: near featureless */
    float band = sin(lat*7.0 + fbm(q*3.0)*1.2*d);
    return mix(vec3(0.55,0.83,0.86), vec3(0.72,0.94,0.95), 0.5+0.5*band);
  }
  float band = sin(lat*8.0 + fbm(q*3.4)*1.6*d);   /* Neptune: deep blue + dark spot */
  vec3 c = mix(vec3(0.16,0.31,0.78), vec3(0.36,0.55,0.95), 0.5+0.5*band);
  float dx = atan(q.z,q.x) + 2.0, dy = (lat - 0.18)*3.0;
  return mix(c, vec3(0.08,0.16,0.44), exp(-dot(vec2(dx,dy),vec2(dx,dy))*9.0)*0.8);
}

/* ---- major moons ----
   Not every moon (Jupiter alone has 95) — one representative set per planet,
   orbiting as small spheres the same way planets orbit the Sun. Sizes and
   orbit radii are stylized for visibility (real ratios would be sub-pixel),
   same spirit as the Sun's exaggerated barycentre wobble elsewhere in this
   file. ids run 9..19, continuing on from the Sun(8)/planets(0-7) scheme.

   MOON_ORB values are NOT arbitrary — this compressed-orbit system packs
   planets much closer together than real space, so a moon orbiting "a
   reasonable-looking distance" from its parent can easily swing out far
   enough to cross a neighbouring planet's path, or the asteroid belt. A
   numeric sweep of the actual minimum parent-to-neighbour (and
   parent-to-belt, for Mars/Jupiter) distance over many simulated years found
   Jupiter's own periapsis brings the belt's outer edge within 1.05 units and
   Saturn within 2.26 — both far less than the old Callisto orbit (3.90),
   which is exactly the "moon passes through the belt and grazes Mars" /
   "moon collides with Saturn's ring" bug reports this fixes.

   The orbit alone isn't the whole story, though — a moon is a SPHERE, not a
   point, so what actually has to clear the parent's own surface is
   MOON_ORB - MOON_RAD, and what has to clear the belt/neighbour ceiling is
   MOON_ORB + MOON_RAD. For Jupiter that ceiling-minus-own-radius band is
   only (0.92, 1.053) wide — 0.133 units total for four moons — which is why
   Jupiter's moons below are sized tiny (0.016-0.026) rather than at their
   real relative scale (Ganymede is actually the solar system's biggest
   moon, bigger than Mercury); at real-ish size none of them fit the band at
   all without clipping either Jupiter's own disk or the belt.

   Earth and Mars are worse: their neighbour ceiling (0.162 and 0.062) is
   already SMALLER than their own planet radius (0.42 and 0.32), so there is
   no orbit that both clears the planet's surface and respects the ceiling —
   satisfying both is mathematically impossible, not just tight. For these
   two, visual correctness (a moon that's actually visible outside its
   planet) wins over the ceiling: they orbit close enough to clear Earth/Mars
   with margin, accepting a small, brief, rare residual chance of a close
   pass near Venus or Mars — a far less jarring failure than a moon rendering
   permanently inside its own planet, which is what the ceiling-following
   values did. */
const int   MOON_N = 11;
const int   MOON_PARENT[11] = int[11](2, 3,3, 4,4,4,4, 5, 6,6, 7);
/* Real-relative-scale where the orbital band allows it (Titan/Titania/
   Oberon/Triton have generous room); shrunk well below real scale for
   Jupiter's four and pulled in for the Moon/Phobos/Deimos, per the orbit
   comment above — those bands simply can't fit a "realistically big" moon.
   Moon/Phobos/Deimos are also sized against their parent's RAD in this file
   (0.21, 0.16) at the real Moon/Earth ratio (~0.27) and a similar visual
   ratio for the two tiny Martian moons — keep these three in step if RAD[2]
   or RAD[3] ever changes again. */
const float MOON_RAD[11]    = float[11](0.057, 0.018,0.014, 0.018,0.016,0.026,0.022, 0.166, 0.051,0.049, 0.087);
const float MOON_ORB[11]    = float[11](0.55, 0.40,0.47, 0.95,0.975,1.00,1.02, 2.05, 1.55,1.95, 1.35);
const float MOON_PH0[11]    = float[11](0.4, 1.9,4.2, 0.6,2.7,4.5,1.2, 3.1, 0.9,3.8, 2.2);
/* Triton runs retrograde (negative) at a steep ~157° tilt to Neptune — the
   one moon in this list large enough to be a real orbital oddity worth
   modelling rather than just decorating. */
const float MOON_SPEED[11]  = float[11](3.2, 4.6,3.0, 5.4,4.1,2.6,1.7, 2.2, 2.9,2.3, -2.0);
const float MOON_INC[11]    = float[11](0.10,0.05,0.30, 0.03,0.02,0.08,0.12, 0.35, 0.28,0.14, 2.74);

vec3 moonPos(int j){
  vec3  pc  = planetPos(MOON_PARENT[j]);
  float ang = MOON_PH0[j] + uTime * MOON_SPEED[j] * uOrbit;
  /* Titan (j==7): orbit flush with Saturn's OWN ring plane (same normal the
     ring-rendering code uses below) instead of a generic inclination — a
     moon tilted on a different axis than the rings it's meant to clear looks
     like it clips through them even when its radius is nominally larger. */
  if(j == 7) return pc + MOON_ORB[j] * vec3(cos(ang), sin(ang)*0.4494, -sin(ang)*0.8934);
  float inc = MOON_INC[j];
  return pc + MOON_ORB[j] * vec3(cos(ang), sin(ang)*sin(inc), sin(ang)*cos(inc));
}
vec3 moonTint(int id){
  if(id==9)  return vec3(0.58,0.56,0.53);   // Moon
  if(id==10) return vec3(0.36,0.34,0.31);   // Phobos
  if(id==11) return vec3(0.42,0.39,0.36);   // Deimos
  if(id==12) return vec3(0.92,0.78,0.36);   // Io: sulfur
  if(id==13) return vec3(0.86,0.83,0.74);   // Europa: ice
  if(id==14) return vec3(0.56,0.51,0.46);   // Ganymede
  if(id==15) return vec3(0.44,0.39,0.35);   // Callisto
  if(id==16) return vec3(0.82,0.62,0.32);   // Titan: hazy orange
  if(id==17) return vec3(0.64,0.62,0.60);   // Titania
  if(id==18) return vec3(0.60,0.56,0.52);   // Oberon
  return       vec3(0.78,0.74,0.80);        // Triton: pale, frost-blue
}
vec3 moonSurface(vec3 n, int id){
  float c = fbm(n*11.0 + float(id)*17.3);
  vec3  base = moonTint(id);
  return mix(base*0.75, base*1.15, c);
}
vec3 plutoCharonSurface(vec3 n, int id){
  float c = fbm(n*9.0 + float(id)*13.0);
  vec3 base = (id==20) ? vec3(0.68,0.60,0.52)    // Pluto: rusty tan (tholins)
                        : vec3(0.58,0.56,0.58);  // Charon: neutral grey
  return mix(base*0.75, base*1.15, c);
}
/* rough, cratered, and — for Vesta — visibly lopsided: a perfect sphere with
   a smooth gradient reads as a mini planet, not an asteroid. Rendered on the
   ellipsoid shape from iEllipsoid()/ellipsoidNormal() above. */
vec3 asteroidSurface(vec3 n, int id){
  float rough = fbm(n*14.0 + float(id)*9.0);
  vec3  base  = mix(vec3(0.42,0.39,0.35), vec3(0.62,0.58,0.52), rough);
  float craters = pow(max(fbm(n*22.0 + 3.0) - 0.58, 0.0) * 2.4, 3.0);
  base *= 1.0 - craters*0.55;
  if(id == 24){
    /* Vesta: Rheasilvia, an impact basin large enough to dominate one whole
       hemisphere in reality — not a subtle crater */
    vec3  d = n - vec3(0.0,-1.0,0.0);
    float basin = exp(-dot(d,d) * 2.2);
    base = mix(base, base*0.55, basin);
  }
  return base;
}

/* ---- Pluto/Charon: a true binary, not a planet-with-a-moon ----
   Charon is unusually large relative to Pluto (about half its diameter), so
   their barycentre sits OUTSIDE Pluto's own surface — both bodies visibly
   orbit a shared empty point between them, "mutual tidal lock". ids 20/21,
   past the moon range (9-19), so they don't collide with that numbering.

   Real Pluto has notably higher eccentricity (0.248) than any planet here,
   and its raw ORBITAL RADIUS does periodically dip inside Neptune's — in
   reality a 3:2 orbital resonance with Neptune (not modelled here) is what
   keeps them from ever actually meeting. What keeps them apart in THIS sim
   is Pluto's real ~17° inclination and node: a numeric sweep of actual 3D
   separation over many simulated years found a minimum of 3.1 units against
   Neptune's 0.58 radius — comfortably safe without needing the resonance. */
const float PLUTO_AU = 39.5, PLUTO_ECC = 0.248, PLUTO_INC = 0.2995, PLUTO_NODE = 1.925, PLUTO_PH0 = 2.0;
const float PLUTO_RAD = 0.10, CHARON_RAD = 0.055;
const float PLUTO_SEP = 0.35;      // Pluto-Charon separation, world units
const float PLUTO_MQ  = 0.12;      // Charon/Pluto mass ratio -> barycentre offset split
const float PLUTO_BSPEED = 2.6;    // binary orbital rate (visual, not to any real period)

vec3 plutoBary(){
  float orbRp = 4.6 * pow(PLUTO_AU, 0.48);
  float m  = uTime * pow(PLUTO_AU, -1.5) * ORB_RATE * uOrbit;
  float nu = PLUTO_PH0 + m;
  float R  = orbRp * (1.0 - PLUTO_ECC*PLUTO_ECC) / (1.0 + PLUTO_ECC*cos(m));
  float cn = cos(PLUTO_NODE), sn = sin(PLUTO_NODE);
  float ci = cos(PLUTO_INC),  si = sin(PLUTO_INC);
  vec3  u  = vec3(cn, 0.0, sn);
  vec3  w  = vec3(-sn*ci, si, cn*ci);
  return R * (cos(nu)*u + sin(nu)*w);
}
vec3 plutoPos(vec3 bary){
  float ang = uTime * PLUTO_BSPEED * uOrbit;
  float off = PLUTO_SEP * PLUTO_MQ / (1.0 + PLUTO_MQ);
  return bary + off * vec3(cos(ang), 0.12*sin(ang*0.7), sin(ang));
}
vec3 charonPos(vec3 bary){
  float ang = uTime * PLUTO_BSPEED * uOrbit;
  float off = PLUTO_SEP / (1.0 + PLUTO_MQ);
  return bary - off * vec3(cos(ang), 0.12*sin(ang*0.7), sin(ang));
}

/* ---- comet ----
   Wildly eccentric (e=0.92): perihelion ~1.0 unit (deep in the inner
   system), aphelion ~24 (out past Uranus). A comet's orbit legitimately
   crosses several planets' paths in reality — that's expected, not the kind
   of "always collapses" bug the tight moon/inner-planet packing was; no
   dedicated neighbour-clearance sweep needed here. */
const float COMET_AU=8.0, COMET_ECC=0.92, COMET_INC=0.35, COMET_NODE=0.5, COMET_PH0=0.0;
const float COMET_RAD = 0.045;

/* generic tilted-ellipse position, same math as planetPos()/plutoBary() but
   parametrised so a new small body doesn't need its own copy-pasted
   function — used by Ceres/Vesta below. */
vec3 smallBodyPos(float au, float ecc, float inc, float node, float ph0){
  float orbRb = 4.6 * pow(au, 0.48);
  float m  = uTime * pow(au, -1.5) * ORB_RATE * uOrbit;
  float nu = ph0 + m;
  float R  = orbRb * (1.0 - ecc*ecc) / (1.0 + ecc*cos(m));
  float cn = cos(node), sn = sin(node);
  float ci = cos(inc),  si = sin(inc);
  vec3  u  = vec3(cn, 0.0, sn);
  vec3  w  = vec3(-sn*ci, si, cn*ci);
  return R * (cos(nu)*u + sin(nu)*w);
}

/* ---- notable asteroids: Ceres and Vesta, the belt's two biggest, rendered
   as distinct clickable bodies rather than lost in the generic speckle
   field. Both sit well inside the belt's already-established safe zone
   (6.4-8.6), so no separate neighbour-clearance sweep is needed — same
   reasoning as the comet. */
const float CERES_AU=2.77, CERES_ECC=0.076, CERES_INC=0.185, CERES_NODE=1.40, CERES_PH0=1.1;
const float VESTA_AU=2.36, VESTA_ECC=0.089, VESTA_INC=0.124, VESTA_NODE=2.62, VESTA_PH0=4.0;
/* ellipsoid, not sphere — Ceres is close to round but not quite (a mild
   flattening), Vesta is genuinely lumpy: Rheasilvia, the impact basin at its
   south pole, flattens and widens that whole hemisphere in reality. */
const vec3  CERES_RAD = vec3(0.055, 0.050, 0.057);
const vec3  VESTA_RAD = vec3(0.044, 0.036, 0.041);

vec3 cometPos(){
  float orbRc = 4.6 * pow(COMET_AU, 0.48);
  float m  = uTime * pow(COMET_AU, -1.5) * ORB_RATE * uOrbit;
  float nu = COMET_PH0 + m;
  float R  = orbRc * (1.0 - COMET_ECC*COMET_ECC) / (1.0 + COMET_ECC*cos(m));
  float cn = cos(COMET_NODE), sn = sin(COMET_NODE);
  float ci = cos(COMET_INC),  si = sin(COMET_INC);
  vec3  u  = vec3(cn, 0.0, sn);
  vec3  w  = vec3(-sn*ci, si, cn*ci);
  return R * (cos(nu)*u + sin(nu)*w);
}

/* The tail always points directly away from the Sun (solar wind/radiation
   pressure — real ion tails do exactly this, straightened out; dust tails
   curve slightly behind the orbital path, simplified to straight here) and
   scales with solar heating: short/faint far out, long/bright near
   perihelion. Rendered as a chain of point-glows — this scene has no march
   loop to volumetrically integrate a real streak, so it reuses the same
   "point-glow via perpendicular ray distance" trick as the barycentre
   marker below, gated by tB so a planet in front still occludes it. */
void addCometTail(vec3 ro, vec3 rd, float tB, vec3 nucleus, vec3 sunPos, inout vec3 col){
  vec3  awaySun = normalize(nucleus - sunPos);
  float solarD  = length(nucleus - sunPos);
  float heat    = clamp(2.2/max(solarD,0.3), 0.0, 1.0);
  float tailLen = mix(0.35, 5.5, heat);
  float bright  = mix(0.10, 1.35, heat);
  const int N = 10;
  for(int i=1;i<=N;i++){
    float f = float(i)/float(N);            // 0 near nucleus .. 1 at tail end
    vec3  Q = nucleus + awaySun*tailLen*f;
    vec3  oc = Q - ro;
    float t  = dot(oc, rd);
    if(t < 0.0 || t > tB) continue;
    vec3  closest = ro + rd*t;
    float perp = length(Q - closest);
    float fall = bright * (1.0 - f) * (1.0 - f);
    /* ion (inner, blue-white) fading into dust (outer, warm) along the tail */
    vec3  tint = mix(vec3(0.55,0.75,1.20), vec3(0.95,0.80,0.55), f);
    col += tint * fall / (perp*perp*900.0 + 0.02);
  }
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  vec3 rd = normalize(uCamMat * vec3(uv, -1.45));
  vec3 ro = uCam;

  /* ---- nearest opaque body ---- */
  float tB = 1e9;
  int   id = -1;
  vec3  ce = vec3(0.0);
  float ra = 0.0;

  float ts = iSphere(ro, rd, uSunPos, SUN_R);
  if(ts > 0.0){ tB = ts; id = 8; ce = uSunPos; ra = SUN_R; }

  for(int i=0;i<8;i++){
    vec3 c = planetPos(i);
    float t = iSphere(ro, rd, c, RAD[i]);
    if(t > 0.0 && t < tB){ tB = t; id = i; ce = c; ra = RAD[i]; }
  }
  for(int j=0;j<MOON_N;j++){
    vec3 c = moonPos(j);
    float t = iSphere(ro, rd, c, MOON_RAD[j]);
    if(t > 0.0 && t < tB){ tB = t; id = 9+j; ce = c; ra = MOON_RAD[j]; }
  }
  vec3 plutoBaryPos = plutoBary();
  vec3 plutoP = plutoPos(plutoBaryPos), charonP = charonPos(plutoBaryPos);
  float tPluto  = iSphere(ro, rd, plutoP,  PLUTO_RAD);
  float tCharon = iSphere(ro, rd, charonP, CHARON_RAD);
  if(tPluto  > 0.0 && tPluto  < tB){ tB = tPluto;  id = 20; ce = plutoP;  ra = PLUTO_RAD; }
  if(tCharon > 0.0 && tCharon < tB){ tB = tCharon; id = 21; ce = charonP; ra = CHARON_RAD; }
  vec3  cometP = cometPos();
  float tComet = iSphere(ro, rd, cometP, COMET_RAD);
  if(tComet  > 0.0 && tComet  < tB){ tB = tComet;  id = 22; ce = cometP;  ra = COMET_RAD; }
  vec3  ceresP = smallBodyPos(CERES_AU, CERES_ECC, CERES_INC, CERES_NODE, CERES_PH0);
  vec3  vestaP = smallBodyPos(VESTA_AU, VESTA_ECC, VESTA_INC, VESTA_NODE, VESTA_PH0);
  float tCeres = iEllipsoid(ro, rd, ceresP, CERES_RAD);
  float tVesta = iEllipsoid(ro, rd, vestaP, VESTA_RAD);
  if(tCeres  > 0.0 && tCeres  < tB){ tB = tCeres;  id = 23; ce = ceresP;  ra = CERES_RAD.x; }
  if(tVesta  > 0.0 && tVesta  < tB){ tB = tVesta;  id = 24; ce = vestaP;  ra = VESTA_RAD.x; }

  vec3 col;
  if(id == 8){
    /* photosphere: granulation plus limb darkening */
    vec3 p = ro + rd*tB;
    vec3 n = normalize(p - uSunPos);
    float gran = fbm(n*9.0 + vec3(0.0, uTime*0.05, 0.0));
    float limb = pow(max(dot(n, -rd), 0.0), 0.42);
    col = mix(vec3(1.30,0.60,0.16), vec3(1.48,1.12,0.62), gran) * (0.42 + 0.72*limb) * uSunL;
  } else if(id >= 0){
    vec3 p = ro + rd*tB;
    vec3 n = (id == 23) ? ellipsoidNormal(p, ce, CERES_RAD)
           : (id == 24) ? ellipsoidNormal(p, ce, VESTA_RAD)
           : normalize(p - ce);
    vec3 L = normalize(uSunPos - p);              // light from the displaced Sun
    float dif = max(dot(n, L), 0.0);
    float att = 1.0 / (1.0 + 0.011*length(p - uSunPos));   // gentler than inverse-square
    vec3 emissive = vec3(0.0);
    vec3 base = (id < 9) ? surface(id, n, emissive) : (id <= 19) ? moonSurface(n, id)
              : (id <= 21) ? plutoCharonSurface(n, id)
              : (id == 22) ? vec3(0.42,0.44,0.48)                              // comet nucleus, dirty ice
              : asteroidSurface(n, id);                                         // 23/24: Ceres/Vesta
    /* fine mottling: invisible at system scale, gives the surface texture once
       you zoom in on a single body. Only costs anything on pixels that hit. */
    base *= 0.88 + 0.26*fbm(n*26.0) + 0.10*vnoise(n*70.0);
    col = base * (0.030 + dif*1.45*att*uSunL);
    /* city lights only past the terminator, ramping in as the Sun drops
       below the horizon rather than snapping on — real dusk does this too */
    col += emissive * smoothstep(0.10, 0.0, dif);
    /* atmospheric limb glow on the bodies that have an atmosphere */
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.2);
    vec3 halo = (id==2) ? vec3(0.28,0.52,1.05)
              : (id==1) ? vec3(0.85,0.72,0.40)
              : (id==6) ? vec3(0.35,0.78,0.85)
              : (id==7) ? vec3(0.22,0.38,0.92)
              : vec3(0.0);
    col += halo * rim * (0.16 + 0.60*dif) * uSunL;
  } else {
    col = deepField(rd);
  }

  /* ---- Saturn's rings: annulus in a plane tilted by its 26.7 deg obliquity ---- */
  vec3  sc = planetPos(5);
  vec3  rn = vec3(0.0, 0.8934, 0.4494);
  float dn = dot(rd, rn);
  if(abs(dn) > 1e-4){
    float tr = dot(sc - ro, rn) / dn;
    if(tr > 0.0 && tr < tB){
      float rr = length((ro + rd*tr) - sc);
      float u  = (rr/RAD[5] - 1.35) / 1.05;       // 1.35 .. 2.40 planet radii
      if(u > 0.0 && u < 1.0){
        float fine = 0.62 + 0.38*sin(u*54.0);
        float cass = 1.0 - 0.82*exp(-pow((u-0.49)*13.0, 2.0));   // Cassini division
        float edge = smoothstep(0.0,0.06,u) * (1.0 - smoothstep(0.90,1.0,u));
        float aA   = clamp(fine*cass*edge*0.85, 0.0, 0.92);
        vec3  rc   = mix(vec3(0.52,0.45,0.34), vec3(0.96,0.89,0.72), fine) * uSunL;
        col = mix(col, rc, aA);
      }
    }
  }

  /* ---- per-planet orbit rings ----
     Each ring lives in ITS OWN inclined plane, hinged on its OWN line of
     nodes (NODE[i]), and traces the true ellipse (periapsis at PH0[i]) —
     matching planetPos() exactly. Previously every ring was a flat circle at
     y=0, then later a circle tilted only around the x-axis, so a planet
     could visibly sit off its own ring or every tilt read as "the same
     hinge". Testing against the actual (u,w) orbital plane fixes both. */
  {
    float g = 0.0;
    for(int i=0;i<8;i++){
      float cn = cos(NODE[i]), sn = sin(NODE[i]);
      float ci = cos(INC[i]),  si = sin(INC[i]);
      vec3  u  = vec3(cn, 0.0, sn);
      vec3  w  = vec3(-sn*ci, si, cn*ci);
      vec3  ni = cross(u, w);                     // orbital-plane normal
      float dn = dot(rd, ni);
      if(abs(dn) > 1e-5){
        float t = -dot(ro, ni) / dn;
        if(t > 0.0 && t < tB){
          vec3  p   = ro + rd*t;                  // point lies exactly in-plane
          float lu  = dot(p, u), lw = dot(p, w);  // in-plane coords
          float ang = atan(lw, lu);
          float rho = length(vec2(lu, lw));
          float ex  = orbR(i) * (1.0 - ECC[i]*ECC[i]) / (1.0 + ECC[i]*cos(ang - PH0[i]));
          g += 0.0055 / (abs(rho - ex) + 0.016);
        }
      }
    }
    /* Pluto's own ring, same technique, own plane/ellipse — it isn't one of
       the 8 planets above (own AU/ECC/INC/NODE consts entirely) */
    {
      float cn = cos(PLUTO_NODE), sn = sin(PLUTO_NODE);
      float ci = cos(PLUTO_INC),  si = sin(PLUTO_INC);
      vec3  u  = vec3(cn, 0.0, sn);
      vec3  w  = vec3(-sn*ci, si, cn*ci);
      vec3  ni = cross(u, w);
      float dn = dot(rd, ni);
      if(abs(dn) > 1e-5){
        float t = -dot(ro, ni) / dn;
        if(t > 0.0 && t < tB){
          vec3  p   = ro + rd*t;
          float lu  = dot(p, u), lw = dot(p, w);
          float ang = atan(lw, lu);
          float rho = length(vec2(lu, lw));
          float orbRp = 4.6 * pow(PLUTO_AU, 0.48);
          float ex  = orbRp * (1.0 - PLUTO_ECC*PLUTO_ECC) / (1.0 + PLUTO_ECC*cos(ang - PLUTO_PH0));
          g += 0.0055 / (abs(rho - ex) + 0.016);
        }
      }
    }
    col += vec3(0.30,0.72,0.95) * g * uPath;
  }

  /* ---- barycentre marker, on the ecliptic, only where unoccluded ---- */
  if(abs(rd.y) > 1e-4){
    float tp = -ro.y / rd.y;
    if(tp > 0.0 && tp < tB){
      float d = length((ro + rd*tp).xz);
      col += vec3(0.34,0.86,1.00) * (0.0032/(d*d + 0.004)) * uPath;
    }
  }

  /* ---- asteroid belt: volumetric scatter of individually-lit rocks in a thin
     3D slab around the ecliptic, instead of a flat painted ring. March only the
     slab the ray actually passes through (bounded by the nearest opaque body,
     so a planet in front still occludes it), then place a jittered rock per
     lattice cell — same "grid + local jitter" trick as deepField()'s stars,
     so no neighbour-cell lookups are needed. */
  if(uBelt > 0.004){
    const float BH = 0.34;                          // slab half-thickness
    float t0, t1;
    if(abs(rd.y) < 1e-4){
      t0 = 0.0; t1 = (abs(ro.y) < BH) ? tB : -1.0;
    } else {
      float ta = (-BH - ro.y)/rd.y, tb = (BH - ro.y)/rd.y;
      t0 = max(min(ta,tb), 0.0);
      t1 = min(max(ta,tb), tB);
    }
    if(t1 > t0){
      const int BSTEPS = 22;
      float dt = (t1 - t0) / float(BSTEPS);
      float t  = t0 + dt*h13(vec3(gl_FragCoord.xy, 3.0));   // dither: kills layer banding
      float occThr = 1.0 - 0.30*clamp(uBelt, 0.0, 2.5);      // denser field at higher uBelt
      for(int i=0;i<BSTEPS;i++){
        vec3  p    = ro + rd*t;
        float rho  = length(p.xz);
        /* outer fade ends at 8.6, not 9.2: Jupiter's real eccentricity brings its
           compressed-orbit periapsis down to ~9.2, which used to graze the belt's
           old outer edge. This keeps a solid ~0.6-unit gap under that periapsis. */
        float dens = smoothstep(6.4,6.9,rho) * (1.0-smoothstep(8.1,8.6,rho));
        if(dens > 0.0){
          vec3 cp   = p * vec3(2.6, 7.0, 2.6);      // flattened lattice: thin in y
          vec3 cid  = floor(cp);
          vec3 gv   = fract(cp) - 0.5;
          vec3 jit  = (h33(cid + 41.7) - 0.5) * 0.86;
          if(h13(cid + 5.3) > occThr){
            float rs = mix(0.10, 0.26, h13(cid + 9.1)) * dens;
            vec3  o  = gv - jit;
            float d  = length(o);
            if(d < rs){
              vec3  n   = normalize(o / vec3(2.6,7.0,2.6));       // unwarp anisotropy back to world dir
              vec3  L   = normalize(uSunPos - p);
              float dif = max(dot(n, L), 0.08);
              col += vec3(0.62,0.55,0.46) * dif * uBelt * 1.3;
            }
          }
        }
        t += dt;
      }
    }
  }

  /* ---- corona / glare, blocked when something is in front of the Sun ---- */
  if(id == 8 || id < 0){
    /* falloff in angle, not pow(cos): pow(ca,12) is still at half brightness
       20 deg off-axis and floods the whole frame */
    float ang = acos(clamp(dot(rd, normalize(uSunPos - ro)), -1.0, 1.0));
    col += vec3(1.00,0.66,0.30) * exp(-ang*24.0) * 0.42 * uSunL;
    col += vec3(1.00,0.85,0.55) * exp(-ang*88.0) * 1.45 * uSunL;
  }

  addCometTail(ro, rd, tB, cometP, uSunPos, col);

  outColor = vec4(max(col, 0.0), 1.0);
}`;

/* ---------------- post-processing passes ---------------- */
export const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uThr;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  float w = smoothstep(uThr, uThr+0.85, l);
  o = vec4(c*w, 1.0);
}`;

export const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  float w[5]; w[0]=0.2270; w[1]=0.1945; w[2]=0.1216; w[3]=0.0540; w[4]=0.0162;
  vec3 s = texture(uTex, vUv).rgb * w[0];
  for(int i=1;i<5;i++){
    vec2 d = uDir*float(i);
    s += texture(uTex, vUv+d).rgb * w[i];
    s += texture(uTex, vUv-d).rgb * w[i];
  }
  o = vec4(s,1.0);
}`;

export const FS_COMP = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom;
uniform vec2  uRes;
uniform float uTime, uBloomAmt, uExp;

vec3 aces(vec3 x){
  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}
float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }

void main(){
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float rr = dot(cc,cc);

  /* chromatic aberration */
  float ab = 0.0026 + 0.010*rr;
  vec3 c;
  c.r = texture(uScene, uv - cc*ab).r;
  c.g = texture(uScene, uv).g;
  c.b = texture(uScene, uv + cc*ab).b;

  vec3 bl = texture(uBloom, uv).rgb;
  c += bl * uBloomAmt;

  c = aces(c * uExp);
  c = pow(c, vec3(1.0/2.05));                        // gamma

  /* saturation lift so the disk reads gold, not grey */
  float lum = dot(c, vec3(0.2126,0.7152,0.0722));
  c = clamp(mix(vec3(lum), c, 1.30), 0.0, 1.0);

  /* subtle cyan grade in the shadows only */
  c = mix(c, c*vec3(0.90,1.02,1.12), 0.16);

  /* scanlines + rolling interference */
  float sl = 0.965 + 0.035*sin(uv.y*uRes.y*1.55 + uTime*2.2);
  c *= sl;
  c += vec3(0.010,0.026,0.032) * pow(max(sin(uv.y*3.0 - uTime*0.45),0.0), 26.0);

  /* vignette + grain */
  c *= smoothstep(1.30, 0.22, rr*1.9);
  c += (h21(uv*uRes + fract(uTime)) - 0.5) * 0.017;

  o = vec4(c, 1.0);
}`;
