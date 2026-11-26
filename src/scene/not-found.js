import { Field } from './field.js';

function gridBackground(gl) {
  const vertex = `#version 300 es
    void main() {
      vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
    }`;
  const fragment = `#version 300 es
    precision highp float;
    uniform vec2 uSize;
    uniform float uDpr;
    out vec4 color;
    void main() {
      vec2 pixel = gl_FragCoord.xy / uDpr;
      vec2 cell = mod(pixel, 36.0);
      float line = 1.0 - smoothstep(0.0, 1.2, min(cell.x, cell.y));
      vec2 uv = (gl_FragCoord.xy - uSize * 0.5) / uSize.y;
      float halo = exp(-dot(uv, uv) * 4.0);
      color = vec4(vec3(0.026, 0.034, 0.052) + halo * vec3(0.017, 0.028, 0.053)
        + line * vec3(0.047, 0.065, 0.092), 1.0);
    }`;
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  const size = gl.getUniformLocation(program, 'uSize');
  const dpr = gl.getUniformLocation(program, 'uDpr');
  return pixelRatio => {
    gl.useProgram(program);
    gl.bindVertexArray(null);
    gl.uniform2f(size, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(dpr, pixelRatio);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

export async function mountNotFoundScene(canvas, code) {
  const field = await new Field(canvas, {
    count: innerWidth < 700 ? 9500 : 17000, latCount: 0, dprMax: 1, fps: 30, wordmark: '404',
  }).init();
  const drawGrid = gridBackground(field.gl);
  if (drawGrid) field.drawBackground = () => drawGrid(field.dpr);
  Object.assign(field.state, { a: 13, b: 13, intro: 1, ripple: .24 });

  function frameScene() {
    const rect = code.getBoundingClientRect();
    const bounds = canvas.getBoundingClientRect();
    const units = 36 * Math.tan(Math.PI / 9) / bounds.height;
    field.state.scale = Math.min(rect.width * .76, rect.height * 2.4) * units / (11.5 * field.state.fit);
    field.state.offsetY = (bounds.top + bounds.height / 2 - rect.top - rect.height / 2) * units;
  }
  const resize = new ResizeObserver(() => {
    if (field.lost || field.disabled) return;
    field.resize();
    frameScene();
  });
  const fallback = () => {
    resize.disconnect();
    document.body.classList.remove('has-missing-scene');
  };
  field.onDegrade = level => { if (level === 'off') fallback(); };
  canvas.addEventListener('webglcontextlost', () => { field.lost = true; fallback(); }, { once: true });
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch' && !field.lost && !field.disabled) field.pointer(e.clientX, e.clientY);
  }, { passive: true });
  document.addEventListener('pointerleave', () => field.pointer(null));
  resize.observe(code);
  resize.observe(canvas);
  frameScene();
  field.renderOnce();
  document.body.classList.add('has-missing-scene');

  let previous;
  function draw(time) {
    if (field.disabled || field.lost) return;
    const dt = Math.min((time - (previous ?? time)) / 1000, .1);
    previous = time;
    field.update(time / 1000, dt);
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}
