/* ---------------- render loop ----------------
   resize()/applyQuality() own the render targets; frame() is the single rAF
   loop: camera easing -> scene pass -> bloom -> composite -> HUD. VIEW is the
   live camera basis, republished every frame so ui.js's click-picking can
   rebuild the exact ray the shader used. */
import { gl, canvas, FLOAT_OK, makeTarget, delTarget, bindTex, drawFull, vao } from './gl.js';
import { P_SCENE, P_MW, P_SS, P_PULSAR, P_BRIGHT, P_BLUR, P_COMP } from './programs.js';
import { S, SCENES, QUALITY, dragging } from './state.js';
import { bodyPos, sunPos } from './ephemeris.js';
import { updateHud } from './hud.js';

const $ = id => document.getElementById(id);

export let scene=null, bloomA=null, bloomB=null, RW=1, RH=1;
export function resize(){
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.floor(window.innerWidth  * dpr);
  const ch = Math.floor(window.innerHeight * dpr);
  canvas.width = cw; canvas.height = ch;
  RW = Math.max(2, Math.floor(cw * S.scale));
  RH = Math.max(2, Math.floor(ch * S.scale));
  delTarget(scene); delTarget(bloomA); delTarget(bloomB);
  scene  = makeTarget(RW, RH);
  const hw = Math.max(2, RW>>1), hh = Math.max(2, RH>>1);
  bloomA = makeTarget(hw, hh);
  bloomB = makeTarget(hw, hh);
}

export function applyQuality(doResize){
  const q = QUALITY[S.quality];
  S.scale = q.scale; S.steps = q.steps;
  $('b-q').textContent = 'QUALITY: ' + q.name;
  if(doResize) resize();
}

/* the live view basis, republished every frame so a click can be turned into a
   world-space ray with exactly the matrix the shader used */
export const VIEW = {cam:[0,0,0], r:[1,0,0], u:[0,1,0], f:[0,0,-1], t:0};

function norm(v){ const l = Math.hypot(v[0],v[1],v[2])||1; return [v[0]/l, v[1]/l, v[2]/l]; }
function cross(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }

/* fired once, the first time frame() actually renders — main.js hooks its
   boot-sequence teardown onto this instead of render.js importing ui.js back
   (which would make the two modules circular for one callback). */
export let onFirstFrame = () => {};
export function setOnFirstFrame(fn){ onFirstFrame = fn; }

let t0 = performance.now(), last = t0, fps = 60, frames = 0, acc = 0, started = false;
let good = 0, autoCap = 2;   // auto-scaler never climbs past HIGH; ULTRA stays manual
export function setAutoCap(v){ autoCap = v; }
export function resetGood(){ good = 0; }

export function frame(now){
  requestAnimationFrame(frame);
  if(!gl || !P_SCENE) return;

  const dt = Math.min((now - last)/1000, 0.1); last = now;
  const t  = (now - t0)/1000;

  /* fps + adaptive downscale */
  frames++; acc += dt;
  if(acc > 0.5){
    fps = frames/acc; frames = 0; acc = 0;
    /* auto-scale: bail out fast when heavy, climb back slowly when there's headroom.
       manual quality changes reset the climb counter so we never fight the user. */
    if(fps < 26 && S.quality > 0){ good = 0; S.quality--; applyQuality(true); }
    else if(fps > 58 && S.quality < autoCap){ if(++good >= 8){ good = 0; S.quality++; applyQuality(true); } }
    else if(fps < 45){ good = 0; }
  }

  /* camera easing */
  if(S.auto && !dragging){ S.tYaw += dt*0.055; S.tPitch += Math.sin(t*0.16)*dt*0.020; }
  S.yaw   += (S.tYaw  - S.yaw)  *Math.min(1, dt*5.0);
  S.pitch += (S.tPitch- S.pitch)*Math.min(1, dt*5.0);
  S.dist  += (S.tDist - S.dist) *Math.min(1, dt*4.0);

  /* look-at target: the origin everywhere except a focused solar-system body,
     which is moving — so the camera has to track it, and we ease the target so
     refocusing reads as a fly-to instead of a cut */
  const tracking = (S.scene === 'ss' && S.focus >= 0);
  const want = tracking ? bodyPos(S.focus, t) : [0,0,0];
  if(tracking){
    /* snap, never ease: an inner planet laps its orbit faster than any easing
       could follow, and a lagging target swings the Sun into frame */
    S.tgt[0] = want[0]; S.tgt[1] = want[1]; S.tgt[2] = want[2];
  } else {
    const k = Math.min(1, dt*3.2);
    for(let i=0;i<3;i++) S.tgt[i] += (want[i] - S.tgt[i])*k;
  }
  const tg = S.tgt;

  /* While tracking a planet, S.yaw is an offset from the body's *sunward*
     direction rather than a world azimuth. A world-fixed azimuth goes stale as
     the planet orbits — Mercury laps in 9.5 s, so within seconds the intended
     54 deg phase angle had drifted to 142 deg and the camera was staring into
     the Sun with the planet in silhouette. Co-rotating the frame pins the phase. */
  const sunRel = tracking && (S.focus < 8 || S.focus === 20 || S.focus === 23 || S.focus === 24);
  const yaw = sunRel ? Math.atan2(-want[0], -want[2]) + S.yaw : S.yaw;

  const cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
  const cam = [ tg[0] + S.dist*cp*Math.sin(yaw),
                tg[1] + S.dist*sp,
                tg[2] + S.dist*cp*Math.cos(yaw) ];
  const f = norm([tg[0]-cam[0], tg[1]-cam[1], tg[2]-cam[2]]);
  let up = [0,1,0];
  if(Math.abs(f[1]) > 0.995) up = [0,0,1];
  const r = norm(cross(f, up));
  const u = cross(r, f);
  /* column-major mat3: [r, u, -f] so vec3(uv,-1.45) maps forward */
  const M = new Float32Array([ r[0],r[1],r[2],  u[0],u[1],u[2],  -f[0],-f[1],-f[2] ]);
  VIEW.cam = cam; VIEW.r = r; VIEW.u = u; VIEW.f = f; VIEW.t = t;   // for click-picking

  /* ---- pass 1: scene (shared camera/time uniforms, then scene-specific) ---- */
  const PS = (S.scene === 'mw') ? P_MW : (S.scene === 'ss') ? P_SS : (S.scene === 'ps') ? P_PULSAR : P_SCENE;
  gl.bindVertexArray(vao);
  gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb);
  gl.viewport(0,0,scene.w,scene.h);
  gl.useProgram(PS.p);
  gl.uniform2f(PS.u.uRes, scene.w, scene.h);
  gl.uniform1f(PS.u.uTime, t);
  gl.uniform3f(PS.u.uCam, cam[0], cam[1], cam[2]);
  gl.uniformMatrix3fv(PS.u.uCamMat, false, M);
  /* the solar-system shader has no march loop, so uSteps is optimised out of it
     and its location comes back undefined — guard rather than rely on that
     being a silent no-op */
  if(PS.u.uSteps) gl.uniform1i(PS.u.uSteps, S.steps);
  gl.uniform1f(PS.u.uStar, S.star);
  if(S.scene === 'mw'){
    gl.uniform1f(PS.u.uArm,  S.arm);
    gl.uniform1f(PS.u.uDust, S.dust);
    gl.uniform1f(PS.u.uCore, S.core);
    gl.uniform1f(PS.u.uHII,  S.hii);
    gl.uniform1f(PS.u.uRot,  S.rot);
    gl.uniform1f(PS.u.uSMark, S.smark);
  } else if(S.scene === 'ss'){
    /* close up on one body the ecliptic plane cuts straight through frame, so
       pull the orbit rings and belt right back rather than streak over it */
    const near = (S.focus >= 0) ? 0.22 : 1.0;
    gl.uniform1f(PS.u.uOrbit,  S.orbit);
    gl.uniform1f(PS.u.uSunL,   S.sunl);
    gl.uniform1f(PS.u.uPath,   S.path * near);
    gl.uniform1f(PS.u.uDetail, S.detail);
    gl.uniform1f(PS.u.uBelt,   S.belt * near);
    const sp = sunPos(t);
    gl.uniform3f(PS.u.uSunPos, sp[0], sp[1], sp[2]);
  } else if(S.scene === 'ps'){
    gl.uniform1f(PS.u.uSpin, S.psSpin);
    gl.uniform1f(PS.u.uBeam, S.psBeam);
    gl.uniform1f(PS.u.uMag,  S.psMag);
    gl.uniform1f(PS.u.uTilt, S.psTilt);
  } else {
    gl.uniform1f(PS.u.uLens, S.lens);
    gl.uniform1f(PS.u.uDisk, S.disk);
    gl.uniform1f(PS.u.uSpin, S.spin);
    gl.uniform1f(PS.u.uDopp, S.dopp);
    gl.uniform1f(PS.u.uJet,  S.jet);
    gl.uniform1f(PS.u.uComp,  S.comp);
    gl.uniform1f(PS.u.uSep,   S.sep);
    gl.uniform1f(PS.u.uFlare, S.flare);
  }
  drawFull();

  /* ---- pass 2: bright ---- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
  gl.viewport(0,0,bloomA.w,bloomA.h);
  gl.useProgram(P_BRIGHT.p);
  bindTex(0, scene.tex, P_BRIGHT.u.uTex);
  gl.uniform1f(P_BRIGHT.u.uThr, 0.78);
  drawFull();

  /* ---- pass 3: separable blur ping-pong ---- */
  gl.useProgram(P_BLUR.p);
  let src = bloomA, dst = bloomB;
  for(let i=0;i<3;i++){
    const rad = 1.0 + i*1.9;
    /* horizontal */
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0,0,dst.w,dst.h);
    bindTex(0, src.tex, P_BLUR.u.uTex);
    gl.uniform2f(P_BLUR.u.uDir, rad/src.w, 0);
    drawFull();
    [src,dst] = [dst,src];
    /* vertical */
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0,0,dst.w,dst.h);
    bindTex(0, src.tex, P_BLUR.u.uTex);
    gl.uniform2f(P_BLUR.u.uDir, 0, rad/src.h);
    drawFull();
    [src,dst] = [dst,src];
  }

  /* ---- pass 4: composite ---- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.useProgram(P_COMP.p);
  bindTex(0, scene.tex, P_COMP.u.uScene);
  bindTex(1, src.tex,   P_COMP.u.uBloom);
  gl.uniform2f(P_COMP.u.uRes, canvas.width, canvas.height);
  gl.uniform1f(P_COMP.u.uTime, t);
  gl.uniform1f(P_COMP.u.uBloomAmt, S.bloom*0.40);
  gl.uniform1f(P_COMP.u.uExp, FLOAT_OK ? 0.82 : 1.05);
  drawFull();

  if(!started){ started = true; onFirstFrame(); }
  if(S.hud) updateHud(t, RW, RH, fps);
}
