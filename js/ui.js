/* ---------------- input + UI wiring ----------------
   Pointer/wheel/touch/keyboard, scene + body-focus switching, hash-based deep
   links, slider/button bindings, foldable panels, and the boot sequence.
   Adding a scene: give it a nav button with data-go="name" in index.html (the
   existing delegated .navb listener below picks it up automatically) and an
   entry in SCENES (state.js); any scene-only controls use data-sc="name" and
   are already handled by the CSS in style.css. */
import { S, SCENES, QUALITY, setDragging } from './state.js';
import { bodyPos, bodyRad, FACTS, SUN_FACT, slugFor, idForSlug } from './ephemeris.js';
import { canvas } from './gl.js';
import { resize, applyQuality, VIEW, setAutoCap, resetGood } from './render.js';

const $ = id => document.getElementById(id);

/* ---------------- pointer / camera drag ---------------- */
let drag=false, lx=0, ly=0, idle=0;
function down(x,y){
  drag=true; setDragging(true); lx=x; ly=y; idle=0;
  S.auto=false; syncAuto(); $('hint').classList.add('hide');
}
function move(x,y){
  if(!drag) return;
  S.tYaw   -= (x-lx)*0.0055;
  S.tPitch  = Math.max(-1.45, Math.min(1.45, S.tPitch + (y-ly)*0.0045));
  lx=x; ly=y;
}

let downX=0, downY=0, moved=0;
canvas.addEventListener('pointerdown', e=>{
  canvas.setPointerCapture(e.pointerId);
  downX = e.clientX; downY = e.clientY; moved = 0;
  down(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', e=>{
  if(drag) moved = Math.max(moved, Math.abs(e.clientX-downX) + Math.abs(e.clientY-downY));
  move(e.clientX, e.clientY);
});
window.addEventListener('pointerup', e=>{
  const wasDrag = drag;
  drag = false; setDragging(false);
  /* a click, not a drag: pick whatever body is under the cursor */
  if(wasDrag && moved < 5 && S.scene === 'ss') pick(e.clientX, e.clientY);
});

/* rebuild the primary ray for a screen point and take the nearest sphere hit.
   Mirrors the shader: uv = (frag - res/2)/res.y, dir = u*r + v*up + 1.45*f,
   remembering gl_FragCoord.y counts up from the bottom. */
function norm(v){ const l = Math.hypot(v[0],v[1],v[2])||1; return [v[0]/l, v[1]/l, v[2]/l]; }
function pick(cx, cy){
  const rect = canvas.getBoundingClientRect();
  const uvx = (cx - rect.left - rect.width*0.5) / rect.height;
  const uvy = (rect.height*0.5 - (cy - rect.top)) / rect.height;
  const d = norm([
    uvx*VIEW.r[0] + uvy*VIEW.u[0] + 1.45*VIEW.f[0],
    uvx*VIEW.r[1] + uvy*VIEW.u[1] + 1.45*VIEW.f[1],
    uvx*VIEW.r[2] + uvy*VIEW.u[2] + 1.45*VIEW.f[2]
  ]);
  let best = Infinity, hit = null;
  for(let id=0; id<=8; id++){
    const c = bodyPos(id, VIEW.t);
    /* generous pick radius: distant planets are only a few pixels wide */
    const ra = bodyRad(id) * 1.9;
    const oc = [VIEW.cam[0]-c[0], VIEW.cam[1]-c[1], VIEW.cam[2]-c[2]];
    const b = oc[0]*d[0] + oc[1]*d[1] + oc[2]*d[2];
    const cc = oc[0]*oc[0] + oc[1]*oc[1] + oc[2]*oc[2] - ra*ra;
    const h = b*b - cc;
    if(h < 0) continue;
    const tt = -b - Math.sqrt(h);
    if(tt > 0 && tt < best){ best = tt; hit = id; }
  }
  if(hit !== null) setFocus(hit);
}

/* The shaders derive rays from uv = (frag - res/2)/res.y, so the VERTICAL field
   of view is fixed and the horizontal one shrinks with the aspect ratio. On a
   375x812 phone the horizontal half-field is only 9deg against 19deg vertical,
   so a subject framed for a desktop overflows the sides. Pulling back by
   1/aspect is the exact correction: tan(hFov) = aspect * tan(vFov). */
function frameScale(){
  const a = (canvas.width && canvas.height) ? canvas.width / canvas.height : 1;
  return a < 1 ? Math.min(1/a, 3.0) : 1;      // capped so freak aspects stay sane
}
function sceneDist(name){ return SCENES[name].dist * frameScale(); }
function focusDist(id){
  /* Saturn needs the extra room for its ring system */
  return bodyRad(id) * (id === 5 ? 8.5 : 5.0) * frameScale();
}

/* when a body is focused the useful zoom range is set by ITS radius, not the
   scene's — otherwise you can never get closer than the whole-system minimum */
function clampDist(d){
  if(S.scene === 'ss' && S.focus >= 0){
    const R = bodyRad(S.focus);
    return Math.max(R*1.22, Math.min(R*90, d));
  }
  const sc = SCENES[S.scene];
  return Math.max(sc.min, Math.min(sc.max, d));
}
canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  S.zoomed = true;                    // stop auto re-framing once the user zooms
  S.tDist = clampDist(S.tDist * (1 + Math.sign(e.deltaY)*0.075));
}, {passive:false});

let pinch = 0;
canvas.addEventListener('touchstart', e=>{ if(e.touches.length===2) pinch = Math.hypot(
  e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); }, {passive:true});
canvas.addEventListener('touchmove', e=>{
  if(e.touches.length===2 && pinch){
    const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    S.zoomed = true;
    S.tDist = clampDist(S.tDist * (pinch/d));
    pinch = d;
  }
}, {passive:true});

/* ---------------- slider/button wiring ---------------- */
function bindSlider(id, key, out, fmt){
  const el = $(id);
  const upd = ()=>{ S[key] = parseFloat(el.value); $(out).textContent = (fmt||(v=>v.toFixed(2)))(S[key]); };
  el.addEventListener('input', upd); upd();
}
bindSlider('s-disk','disk','v-disk');
bindSlider('s-lens','lens','v-lens');
bindSlider('s-spin','spin','v-spin');
bindSlider('s-jet','jet','v-jet');
bindSlider('s-dopp','dopp','v-dopp');
bindSlider('s-bloom','bloom','v-bloom');
bindSlider('s-star','star','v-star');
bindSlider('s-arm','arm','v-arm');
bindSlider('s-dust','dust','v-dust');
bindSlider('s-core','core','v-core');
bindSlider('s-hii','hii','v-hii');
bindSlider('s-rot','rot','v-rot');
bindSlider('s-orbit','orbit','v-orbit');
bindSlider('s-sunl','sunl','v-sunl');
bindSlider('s-path','path','v-path');
bindSlider('s-detail','detail','v-detail');
bindSlider('s-belt','belt','v-belt');
bindSlider('s-bary','bary','v-bary');
bindSlider('s-smark','smark','v-smark');

/* ---------------- scene switching ---------------- */
export function setScene(name){
  if(!SCENES[name]) return;
  S.scene = name;
  const sc = SCENES[name];
  document.body.className = 'scene-' + name;
  document.querySelectorAll('.navb').forEach(b => b.classList.toggle('on', b.dataset.go === name));
  $('ti-lbl').innerHTML = sc.lbl;
  $('ti-h1').textContent = sc.h1;
  $('ti-sub').innerHTML = sc.sub;
  $('t-rl').textContent = sc.rlbl;
  $('t-sl').textContent = sc.slbl;
  sc.meters.forEach((m,i) => { $('m'+(i+1)+'l').textContent = m; });
  $('tick').firstElementChild.innerHTML = sc.tick;
  /* reframe the camera for the new subject's scale and the current aspect */
  const d = sceneDist(name);
  S.zoomed = false;
  S.tDist = d; S.tPitch = sc.pitch;
  S.dist = d; S.pitch = sc.pitch;
  $('ret').style.display = (name === 'bh') ? '' : 'none';
  if(name === 'ss') setFocus(-1); else publishState();
}
document.querySelectorAll('.navb').forEach(b => b.onclick = ()=> setScene(b.dataset.go));

/* ---------------- body focus ---------------- */
export function setFocus(id){
  S.focus = id;
  document.querySelectorAll('.bb').forEach(b => b.classList.toggle('on', +b.dataset.b === id));
  if(S.scene === 'ss'){
    if(id < 0){
      $('ti-h1').textContent = 'SOLAR SYSTEM';
      $('ti-sub').innerHTML  = SCENES.ss.sub;
    } else {
      const F = (id === 8) ? SUN_FACT : FACTS[id];
      $('ti-h1').textContent = F.n;
      $('ti-sub').innerHTML  = (id === 8)
        ? 'G2V PRIMARY &middot; 8 PLANETS &middot; R = 696,340 km'
        : 'PLANET ' + (id+1) + ' of 8 &middot; a = ' + F.a + ' &middot; '
          + F.mo + (F.mo === '1' ? ' moon' : ' moons');
    }
  }
  S.zoomed = false;                     // re-framing is allowed again
  if(id < 0){
    S.tDist = sceneDist('ss'); S.tPitch = SCENES.ss.pitch;
  } else {
    S.tDist  = focusDist(id);
    S.tPitch = 0.30;
    /* 54 deg phase angle, as an offset in the sun-relative frame (see frame()).
       Not shallower: for Mercury and Venus the camera sits only 1-2 units out,
       and a small angle parks it almost against the Sun's surface. */
    if(id < 8) S.tYaw = 0.95;
  }
  publishState();
}
document.querySelectorAll('.bb').forEach(b => b.onclick = ()=> setFocus(+b.dataset.b));

/* ---------------- deep links ----------------
   State lives in the hash so a reload or a shared link lands on the same scene
   and body: #bh, #mw, #ss, #ss/saturn. replaceState, not pushState, so panning
   around does not fill the back button with history entries. */
function publishState(){
  let h = S.scene;
  if(S.scene === 'ss' && S.focus >= 0) h += '/' + slugFor(S.focus);
  try{ history.replaceState(null, '', '#' + h); }
  catch(e){ location.hash = h; }              // some file:// contexts refuse replaceState

  let subject = SCENES[S.scene].h1;
  if(S.scene === 'ss' && S.focus >= 0){
    subject = ((S.focus === 8) ? SUN_FACT : FACTS[S.focus]).n + ' · SOLAR SYSTEM';
  }
  document.title = subject + ' | SINGULARITY OBSERVATORY';
}
export function applyHash(){
  const raw = (location.hash || '').replace(/^#/, '').toLowerCase();
  if(!raw) return false;
  const parts = raw.split('/');
  if(!SCENES[parts[0]]) return false;
  setScene(parts[0]);                          // for 'ss' this resets focus to -1
  if(parts[0] === 'ss' && parts[1]) setFocus(idForSlug(parts[1]));
  return true;
}
window.addEventListener('hashchange', applyHash);

export function syncAuto(){ $('b-auto').classList.toggle('on', S.auto); }
$('b-auto').onclick = ()=>{ S.auto = !S.auto; syncAuto(); };
$('b-hud').onclick  = ()=> toggleHud();
$('b-q').onclick    = ()=>{ S.quality = (S.quality+1) % QUALITY.length; setAutoCap(S.quality); resetGood(); applyQuality(true); };
$('b-reset').onclick= ()=> reset();

function toggleHud(){ S.hud = !S.hud; $('hud').classList.toggle('off', !S.hud); $('b-hud').classList.toggle('on', !S.hud); }

/* Foldable panels. Each auto-collapses when the viewport is too small to carry
   it — the control array covered 42% of a phone screen — but a manual toggle
   pins that panel's state so resizing never fights the user. */
const FOLDS = [
  { panel:'ctrl', btn:'c-tog', touched:false,
    auto:()=> window.innerWidth <= 700 || window.innerHeight <= 620 },
  /* telemetry is the primary readout, so it stays open on a normal phone in
     portrait — two columns keep it to ~6 lines — and only folds itself away
     when vertical space is genuinely scarce, e.g. landscape */
  { panel:'tel',  btn:'t-tog', touched:false,
    auto:()=> window.innerHeight <= 620 }
];
FOLDS.forEach(f => {
  $(f.btn).onclick = ()=>{ f.touched = true; $(f.panel).classList.toggle('collapsed'); };
});
export function autoCollapse(){
  FOLDS.forEach(f => {
    if(f.touched) return;
    $(f.panel).classList.toggle('collapsed', f.auto());
  });
}

function reset(){
  const sc = SCENES[S.scene];
  S.tYaw=0.62; S.tPitch=sc.pitch; S.tDist=sceneDist(S.scene); S.zoomed=false; S.auto=true; syncAuto();
  if(S.scene === 'ss') setFocus(-1);
  const d={ 's-disk':1.15,'s-lens':1,'s-spin':1,'s-jet':1,'s-dopp':1,'s-bloom':1.05,'s-star':1,
            's-arm':1,'s-dust':1,'s-core':1,'s-hii':1,'s-rot':1,
            's-orbit':1,'s-sunl':1,'s-path':1,'s-detail':1,'s-belt':1,
            's-bary':0,'s-smark':1 };
  for(const k in d){ $(k).value = d[k]; $(k).dispatchEvent(new Event('input')); }
}

window.addEventListener('keydown', e=>{
  const k = e.key.toLowerCase();
  if(k==='h') toggleHud();
  if(k==='r') reset();
  if(k==='q'){ S.quality=(S.quality+1)%QUALITY.length; setAutoCap(S.quality); resetGood(); applyQuality(true); }
  if(k===' '){ e.preventDefault(); S.auto=!S.auto; syncAuto(); }
  if(k==='1') setScene('bh');
  if(k==='2') setScene('mw');
  if(k==='3') setScene('ss');
  if(k==='tab'){
    e.preventDefault();
    const order = ['bh','mw','ss'];
    setScene(order[(order.indexOf(S.scene) + 1) % order.length]);
  }
});
window.addEventListener('resize', ()=>{
  autoCollapse();
  clearTimeout(window.__rt);
  window.__rt = setTimeout(()=>{
    resize();
    /* rotating a phone flips which axis limits the view, so re-fit the subject
       — unless the user has zoomed themselves, in which case leave it alone */
    if(!S.zoomed){
      S.tDist = (S.scene === 'ss' && S.focus >= 0) ? focusDist(S.focus) : sceneDist(S.scene);
    }
  }, 120);
});

/* ---------------- boot sequence ---------------- */
const BOOT = [
  'INIT WEBGL2 CONTEXT ................ <b>OK</b>',
  'COMPILE GEODESIC INTEGRATOR ........ <b>OK</b>',
  'LOAD SCHWARZSCHILD METRIC .......... <b>OK</b>',
  'CALIBRATE ACCRETION SPECTRUM ....... <b>OK</b>',
  'LOCK PHOTON SPHERE @ 1.5 R_S ....... <b>OK</b>',
  'SPIN UP JET MAGNETOSPHERE .......... <b>OK</b>',
  'BUILD SPIRAL DENSITY WAVE .......... <b>OK</b>',
  'RESOLVE PLANETARY EPHEMERIDES ...... <b>OK</b>',
  'ESTABLISH TELEMETRY LINK ........... <b>OK</b>'
];
let bi = 0;
export function bootStep(){
  if(bi < BOOT.length){
    $('bootlog').innerHTML += BOOT[bi] + '<br>';
    $('bootbar').style.width = ((bi+1)/BOOT.length*100) + '%';
    bi++;
    setTimeout(bootStep, 190 + Math.random()*130);
  }
}
export function finishBoot(){
  const need = 190*BOOT.length + 380;
  setTimeout(()=>{
    $('boot').classList.add('gone');
    setTimeout(()=> $('boot').style.display='none', 800);
    setTimeout(()=> $('hint').classList.add('hide'), 9000);
  }, need);
}
