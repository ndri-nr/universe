/* ---------------- GL plumbing ----------------
   Context creation, shader compile/link, and render-target helpers. No scene
   knowledge lives here — shaders.js owns GLSL, programs.js owns compiling the
   actual program set, render.js owns the frame loop. */
import { VS } from './shaders.js';

export const canvas = document.getElementById('gl');
export const gl = canvas.getContext('webgl2', {antialias:false, alpha:false, depth:false, stencil:false,
                                        powerPreference:'high-performance', preserveDrawingBuffer:false});
if(!gl){ document.getElementById('err').style.display='flex'; document.getElementById('boot').style.display='none'; }

export const FLOAT_OK = gl ? !!gl.getExtension('EXT_color_buffer_float') : false;
if(gl) gl.getExtension('OES_texture_float_linear');

export function sh(type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
export function prog(fs){
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){ const info = gl.getActiveUniform(p,i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return {p, u};
}

export let vao;
if(gl){
  vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}

export function makeTarget(w,h){
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const ifmt = FLOAT_OK ? gl.RGBA16F : gl.RGBA8;
  const type = FLOAT_OK ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return {tex, fb, w, h};
}
export function delTarget(t){ if(!t) return; gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }

export function drawFull(){ gl.drawArrays(gl.TRIANGLES, 0, 3); }
export function bindTex(unit, tex, loc){
  gl.activeTexture(gl.TEXTURE0+unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(loc, unit);
}
