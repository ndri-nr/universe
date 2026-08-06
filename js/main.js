/* ---------------- entry point ----------------
   Imported by index.html as a module. Order below doesn't control load order
   (ES modules resolve the dependency graph regardless of import order here),
   it's just readable top-to-bottom: GL context -> compiled programs -> render
   loop -> UI wiring -> go. */
import { gl } from './gl.js';
import { P_SCENE } from './programs.js';
import { resize, applyQuality, frame, setOnFirstFrame } from './render.js';
import { syncAuto, autoCollapse, applyHash, setScene, bootStep, finishBoot } from './ui.js';

setOnFirstFrame(finishBoot);

if(gl && P_SCENE){
  applyQuality(false);
  resize();
  syncAuto();
  autoCollapse();
  if(!applyHash()) setScene('bh');   // honour a deep link, else default scene
  bootStep();
  requestAnimationFrame(frame);
}
