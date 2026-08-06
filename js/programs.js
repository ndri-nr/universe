/* ---------------- compiled program set ----------------
   One prog() call per scene/pass. A new scene needs one more line here (plus
   its FS_ source in shaders.js and its dispatch in render.js). */
import { gl, prog } from './gl.js';
import { FS_SCENE, FS_MW, FS_SS, FS_PULSAR, FS_NEBULA, FS_XP, FS_BRIGHT, FS_BLUR, FS_COMP } from './shaders.js';

export let P_SCENE, P_MW, P_SS, P_PULSAR, P_NEBULA, P_XP, P_BRIGHT, P_BLUR, P_COMP;
try{
  if(gl){
    P_SCENE  = prog(FS_SCENE);
    P_MW     = prog(FS_MW);
    P_SS     = prog(FS_SS);
    P_PULSAR = prog(FS_PULSAR);
    P_NEBULA = prog(FS_NEBULA);
    P_XP     = prog(FS_XP);
    P_BRIGHT = prog(FS_BRIGHT);
    P_BLUR   = prog(FS_BLUR);
    P_COMP   = prog(FS_COMP);
  }
}catch(e){
  console.error('SHADER', e.message);
  document.getElementById('err').style.display='flex';
  document.getElementById('err').firstElementChild.innerHTML =
    '<b>SHADER COMPILE ERROR</b><br><br><pre style="text-align:left;white-space:pre-wrap;font-size:10px">'+e.message+'</pre>';
  document.getElementById('boot').style.display='none';
}
