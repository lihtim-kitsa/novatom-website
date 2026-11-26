import { vertexShader, fragmentShader } from './shaders.js';
import { buildLattices } from './lattices.js';
import { buildWordmark } from './wordmark.js';

/**
 * Raw WebGL2 point renderer. One program, one draw call, no scene graph.
 * The whole library cost is this file, so the page ships ~5 KB of renderer
 * instead of a general 3D engine.
 */

export const PALETTE = {
  light: { fg: [0.086, 0.094, 0.122], amber: [0.851, 0.643, 0.255], cobalt: [0.184, 0.42, 0.941] },
  dark: { fg: [0.91, 0.918, 0.925], amber: [0.941, 0.714, 0.333], cobalt: [0.435, 0.608, 1.0] },
};

const lerp = (a, b, t) => a + (b - a) * t;
const FOV = (40 * Math.PI) / 180;
const CAM_Z = 18;

function gauss() {
  const u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

export class Field {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{count:number, latCount:number, dprMax:number, fps:number}} opts
   */
  constructor(canvas, { count, latCount, dprMax, fps, bonds }) {
    this.wantBonds = !!bonds;
    this.canvas = canvas;
    this.count = count;
    this.latCount = latCount;
    this.dprMax = dprMax;
    this.dpr = dprMax;
    this.minDt = 1 / fps;
    this.budgetMs = (1000 / fps) * 1.55;   // sustained frame time above this => degrade
    this.drawCount = count;

    const gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, powerPreference: 'default',
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    this.state = {
      a: 8, b: 8, m: 0, intro: 0, rot: 0, rotX: 0, scale: 1, vel: 0, offsetX: 0, offsetY: 0,
      clear: [-1, -1, 0.35, 0.35], clearK: 0, matA: 0, matB: 0, matMix: 0, fit: 1,
      ripple: 0, dust: 0, burst: 0, twist: 0, par: [0, 0],
    };
    this.mouse = { x: 99, y: 99, k: 0, tx: 99, ty: 99, active: false };
    this.ema = 1000 / fps;
    this.frames = 0;
    this.acc = 0;
    this.drawElapsed = 0;
    this.frozen = false;
    this.lost = false;
    this.onDegrade = null;
    this.disabled = false;
    this.paused = false;

  }

  async init() {
    const gl = this.gl;
    await this._program();
    this._buffers();
    this.resize();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);   // additive: overlapping points glow
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    return this;
  }

  async _program() {
    const gl = this.gl;
    const vs = compile(gl, gl.VERTEX_SHADER, vertexShader);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    const parallel = gl.getExtension('KHR_parallel_shader_compile');
    gl.linkProgram(prog);
    if (parallel) {
      while (!gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR)) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error('Program link failed: ' + log);
    }
    gl.useProgram(prog);
    this.prog = prog;
    this.loc = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      this.loc[info.name] = gl.getUniformLocation(prog, info.name);
    }
  }

  _buffers() {
    const gl = this.gl;
    const N = this.count, L = this.latCount;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N * 4);
    const lat0 = new Float32Array(N * 3);
    const lat1 = new Float32Array(N * 3);
    const lat2 = new Float32Array(N * 3);
    const cls = new Float32Array(N);
    const spec = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      const dust = Math.random() < 0.25;
      const sx = dust ? 9 : 4.4, sy = dust ? 5.5 : 2.7, sz = dust ? 5 : 2.9;
      pos[i * 3] = Math.max(-13, Math.min(13, gauss() * sx));
      pos[i * 3 + 1] = Math.max(-7.5, Math.min(7.5, gauss() * sy));
      pos[i * 3 + 2] = Math.max(-8, Math.min(8, gauss() * sz));
      seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random();
      seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = Math.random();
    }
    const lat = buildLattices(L, { bonds: this.wantBonds });
    for (let i = 0; i < L; i++) {
      for (let a = 0; a < 3; a++) {
        lat0[i * 3 + a] = lat.wurtzite.positions[i * 3 + a];
        lat1[i * 3 + a] = lat.sic.positions[i * 3 + a];
        lat2[i * 3 + a] = lat.fluorite.positions[i * 3 + a];
      }
      spec[i * 3] = lat.wurtzite.species[i];
      spec[i * 3 + 1] = lat.sic.species[i];
      spec[i * 3 + 2] = lat.fluorite.species[i];
      cls[i] = Math.random() < 0.4 ? 1 : 2;
    }

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.bufs = [];
    const attr = (name, data, size) => {
      const loc = gl.getAttribLocation(this.prog, name);
      if (loc < 0) return;
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      this.bufs.push(b);
    };
    attr('position', pos, 3); attr('aSeed', seed, 4);
    attr('aLat0', lat0, 3); attr('aLat1', lat1, 3); attr('aLat2', lat2, 3);
    attr('aClass', cls, 1); attr('aSpec', spec, 3);
    attr('aTxt', buildWordmark(N), 3);
    this.hasWordmark = true;

    this.ebos = null;
    if (lat.bonds) {
      this.ebos = lat.bonds.map((pairs) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, pairs, gl.STATIC_DRAW);
        return b;
      });
      this.eboN = lat.bonds.map((pairs) => pairs.length);
    }
  }

  /** bond lines for the finished crystal; two passes cross-fade while the material morphs */
  _drawBonds(gl, L, s) {
    if (!this.ebos || (s.a < 4.5 && s.b < 4.5)) return;
    const slot = (m) => (m === 2 ? 1 : m === 3 ? 2 : 0);
    const a = slot(s.matA), b = slot(s.matB);
    gl.uniform1f(L.uMode, 1);
    const draw = (i, alpha) => {
      if (alpha < 0.01) return;
      gl.uniform1f(L.uBondA, alpha);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebos[i]);
      gl.drawElements(gl.LINES, this.eboN[i], gl.UNSIGNED_INT, 0);
    };
    const base = 0.42;
    if (a === b) draw(a, base);
    else { draw(a, base * (1 - s.matMix)); draw(b, base * s.matMix); }
    gl.uniform1f(L.uMode, 0);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.max(1, Math.round(w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(h * this.dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.aspect = w / h;
    this.state.fit = Math.max(0.5, Math.min(1, this.aspect / 1.75));
    const f = 1 / Math.tan(FOV / 2), n = 0.1, fr = 100;
    this.proj = new Float32Array([
      f / this.aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (fr + n) / (n - fr), -1,
      0, 0, (2 * fr * n) / (n - fr), 0,
    ]);
  }

  /** pointer in client px, or null to release. Maps to the z = 0 plane analytically. */
  pointer(cx, cy) {
    if (cx == null) { this.mouse.active = false; return; }
    const r = this.canvas.getBoundingClientRect();
    const nx = ((cx - r.left) / r.width) * 2 - 1;
    const ny = -(((cy - r.top) / r.height) * 2 - 1);
    const half = Math.tan(FOV / 2) * CAM_Z;
    this.mouse.tx = nx * half * this.aspect;
    this.mouse.ty = ny * half;
    this.mouse.active = true;
  }

  _palette() { return PALETTE.dark; }

  /** @param {number} time seconds @param {number} dt seconds @param {number} opacity */
  update(time, dt) {
    if (this.disabled || this.lost || this.paused) return;
    const m = this.mouse;
    m.x = lerp(m.x, m.tx, 1 - Math.exp(-dt * 14));
    m.y = lerp(m.y, m.ty, 1 - Math.exp(-dt * 14));
    m.k = lerp(m.k, m.active ? 1 : 0, 1 - Math.exp(-dt * 6));

    // frame cap: phones draw at half rate
    this.acc += dt;
    this.drawElapsed += dt;
    if (this.acc < this.minDt - 0.003) return;
    const frameDt = this.drawElapsed;
    this.drawElapsed = 0;
    // Keep the fractional interval so 24 fps can alternate two and three
    // refreshes on a 60 Hz display instead of rounding down to 20 fps.
    this.acc = Math.max(-.003, Math.min(this.acc - this.minDt, this.minDt * .5));
    this._draw(time, frameDt);
  }

  _draw(time, dt) {
    const gl = this.gl, s = this.state, L = this.loc, p = this._palette();
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(L.uProj, false, this.proj);
    gl.uniform1f(L.uTime, this.frozen ? 0 : time);
    gl.uniform1f(L.uA, s.a);
    gl.uniform1f(L.uB, s.b);
    gl.uniform1f(L.uM, s.m);
    gl.uniform1f(L.uRotX, s.rotX);
    gl.uniform1f(L.uRipple, s.ripple);
    gl.uniform1f(L.uWaferBoundary, s.waferBoundary ?? 1);
    gl.uniform1f(L.uDust, s.dust);
    gl.uniform1f(L.uBurst, s.burst);
    gl.uniform1f(L.uTwist, s.twist);
    gl.uniform2f(L.uPar, s.par[0], s.par[1]);
    gl.uniform1f(L.uIntro, s.intro);
    gl.uniform1f(L.uPx, this.dpr);
    gl.uniform1f(L.uSize, 1.9);
    gl.uniform1f(L.uVel, s.vel);
    gl.uniform1f(L.uRotY, s.rot);
    gl.uniform1f(L.uScale, s.scale * s.fit);
    gl.uniform1f(L.uLatR, 3.5);
    gl.uniform2f(L.uOffset, s.offsetX * s.fit, s.offsetY);
    gl.uniform2f(L.uMouse, this.mouse.x, this.mouse.y);
    gl.uniform1f(L.uMouseK, this.mouse.k);
    gl.uniform4f(L.uClear, s.clear[0], s.clear[1], s.clear[2], s.clear[3]);
    gl.uniform1f(L.uClearK, s.clearK);
    gl.uniform1f(L.uMatA, s.matA);
    gl.uniform1f(L.uMatB, s.matB);
    gl.uniform1f(L.uMatMix, s.matMix);
    gl.uniform3f(L.uFg, p.fg[0], p.fg[1], p.fg[2]);
    gl.uniform3f(L.uAmber, p.amber[0], p.amber[1], p.amber[2]);
    gl.uniform3f(L.uCobalt, p.cobalt[0], p.cobalt[1], p.cobalt[2]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(L.uMode, 0);
    this._drawBonds(gl, L, s);
    gl.drawArrays(gl.POINTS, 0, this.drawCount);
    this._adapt(dt);
  }

  /**
   * Stay inside the frame budget. Wall-clock frame time (not CPU submit time) is what
   * the visitor feels, so we watch the gap between draws: sustained over budget means
   * lower the pixel ratio, then drop the non-crystal points, then give up on WebGL.
   */
  _adapt(dt) {
    this.frames++;
    this.ema = lerp(this.ema, dt * 1000, 0.06);
    if (this.frames < 80 || this.frames % 40 !== 0) return;
    if (this.ema <= this.budgetMs) return;
    if (this.dpr > 1) {
      this.dpr = Math.max(1, this.dpr - 0.25);
      this.resize();
    } else if (this.drawCount > this.latCount + 3000) {
      this.drawCount = Math.max(this.latCount + 2000, Math.floor(this.drawCount * 0.6));
    } else if (this.dpr > 0.75) {
      this.dpr = 0.75;
      this.resize();
    } else {
      this.disabled = true;
      if (this.onDegrade) this.onDegrade('off');
      return;
    }
    this.ema = this.budgetMs * 0.8; // re-measure after a change
    if (this.onDegrade) this.onDegrade('lowered');
  }

  renderOnce() {
    this.acc = 1;
    this._draw(0, 0.016);
  }

  dispose() {
    const gl = this.gl;
    this.bufs.forEach((b) => gl.deleteBuffer(b));
    if (this.ebos) this.ebos.forEach((b) => gl.deleteBuffer(b));
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.prog);
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  }
}
