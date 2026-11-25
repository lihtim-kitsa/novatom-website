import gsap from 'gsap';

const vertex = `
attribute vec2 point;
uniform float size;
uniform float progress;
uniform float time;
uniform vec2 pointer;
uniform float pointerStrength;
uniform float aspect;
varying vec3 ink;
void main() {
  float seed = fract(sin(dot(point, vec2(63.31, 44.73))) * 4375.63);
  vec3 random = fract(sin((seed + vec3(3.4, 1.7, 5.1)) * vec3(212.7, 154.3, 98.2)) * 4396.8);
  vec3 cloud = (random - 0.5) * vec3(1.88, 1.5, 1.2);
  cloud.xy += 0.10 * vec2(sin(time * 0.49 + seed * 29.0), cos(time * 0.42 + seed * 37.0));
  vec3 letter = vec3((point.x - 0.5) * 1.94, (0.5 - point.y) * 0.95, 0.0);
  float delay = 0.13 + random.z * 0.29;
  float arrival = smoothstep(delay, min(1.0, delay + 0.56), progress);
  vec3 p = mix(cloud, letter, arrival);
  float perspective = 1.0 / (1.0 - p.z * 0.25);
  gl_Position = vec4(p.xy * perspective, 0.0, 1.0);
  // Measure distance in screen space so the opening stays round on a wide title.
  vec2 delta = (gl_Position.xy - pointer) * vec2(aspect, 1.0);
  float force = exp(-dot(delta, delta) / 0.13) * pointerStrength * arrival;
  vec2 push = normalize(delta + vec2(0.0001)) * force * (0.28 + seed * 0.17);
  gl_Position.xy += push / vec2(aspect, 1.0);
  float row = point.y < 0.73 ? point.y / 0.70 : (point.y - 0.79) / 0.20;
  vec3 ice = vec3(245.0, 248.0, 255.0) / 255.0;
  vec3 steel = vec3(175.0, 198.0, 232.0) / 255.0;
  vec3 cobalt = vec3(77.0, 121.0, 206.0) / 255.0;
  ink = mix(ice, steel, clamp(row / 0.65, 0.0, 1.0));
  ink = mix(ink, cobalt, clamp((row - 0.65) / 0.35, 0.0, 1.0));
  if (point.y >= 0.73) ink = mix(ink, steel, 0.3);
  ink *= 0.73 + 0.27 * seed;
  ink = mix(mix(vec3(0.16, 0.34, 0.72), vec3(0.88, 0.94, 1.0), seed) * 0.65, ink, arrival);
  gl_PointSize = size * perspective * mix(0.50 + seed * 0.3, 0.85 + seed * 0.28, arrival);
}`;

const fragment = `
precision mediump float;
varying vec3 ink;
void main() {
  float alpha = 1.0 - smoothstep(0.24, 0.5, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(ink, alpha);
}`;

let samples;
function sampleLetters(image) {
  if (samples) return samples;
  const mask = document.createElement('canvas');
  mask.width = 958;
  mask.height = 187;
  const ctx = mask.getContext('2d');
  ctx.drawImage(image, 0, 0, mask.width, mask.height);
  const { data } = ctx.getImageData(0, 0, mask.width, mask.height);
  const points = [];
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x += 2) {
      if (data[(y * mask.width + x) * 4 + 3] < 175) continue;
      points.push((x + Math.random() * 1.7) / mask.width, (y + Math.random()) / mask.height);
    }
  }
  samples = new Float32Array(points);
  return samples;
}

function compile(gl, kind, source) {
  const shader = gl.createShader(kind);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    throw new Error('Particle wordmark shader failed to compile');
  }
  return shader;
}

export function mountParticleSignature(mark) {
  const image = mark.querySelector('img');
  const canvas = mark.querySelector('canvas');
  const isHero = mark.classList.contains('hero-signature');
  const input = new AbortController();
  const cursor = { x: 0, y: 0, strength: 0, target: 0 };
  const motion = { progress: 0 };
  let gl, program, buffer, observer, resize, tween;
  let render = () => {};
  let disposed = false;
  const dispose = () => {
    disposed = true;
    input.abort();
    observer?.disconnect();
    resize?.disconnect();
    tween?.kill();
    gsap.ticker.remove(render);
    mark.classList.remove('is-particle');
    if (gl) {
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    }
  };

  const start = async () => {
    try {
      await image.decode();
      if (disposed) return;
      gl = canvas.getContext('webgl', { alpha: true });
      if (!gl) return;
      const points = sampleLetters(image);
      program = gl.createProgram();
      for (const [kind, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const shader = compile(gl, kind, source);
        gl.attachShader(program, shader);
        gl.deleteShader(shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { dispose(); return; }
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
      const point = gl.getAttribLocation(program, 'point');
      gl.enableVertexAttribArray(point);
      gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);
      const size = gl.getUniformLocation(program, 'size');
      const progress = gl.getUniformLocation(program, 'progress');
      const clock = gl.getUniformLocation(program, 'time');
      const pointer = gl.getUniformLocation(program, 'pointer');
      const pointerStrength = gl.getUniformLocation(program, 'pointerStrength');
      const aspect = gl.getUniformLocation(program, 'aspect');
      if (matchMedia('(any-pointer: fine)').matches) {
        const release = () => { cursor.target = 0; };
        window.addEventListener('pointermove', (event) => {
          if (event.pointerType === 'touch') { release(); return; }
          const bounds = canvas.getBoundingClientRect();
          if (!bounds.width || !bounds.height || !mark.contains(event.target)) { release(); return; }
          cursor.x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
          cursor.y = 1 - (event.clientY - bounds.top) / bounds.height * 2;
          cursor.target = 1;
        }, { passive: true, signal: input.signal });
        mark.addEventListener('pointerleave', release, { signal: input.signal });
        window.addEventListener('blur', release, { signal: input.signal });
      }
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      render = (time = 0) => {
        cursor.strength += (cursor.target - cursor.strength) * 0.16;
        if (cursor.target === 0 && cursor.strength < 0.005) cursor.strength = 0;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(size, Math.max(1.0, canvas.width / 510));
        gl.uniform1f(progress, motion.progress);
        gl.uniform1f(clock, time);
        gl.uniform2f(pointer, cursor.x, cursor.y);
        gl.uniform1f(pointerStrength, cursor.strength);
        gl.uniform1f(aspect, canvas.width / Math.max(1, canvas.height));
        gl.drawArrays(gl.POINTS, 0, points.length / 2);
      };
      resize = new ResizeObserver(() => {
        const dpr = Math.min(devicePixelRatio, 2);
        canvas.width = Math.max(1, Math.round(mark.clientWidth * dpr));
        canvas.height = Math.max(1, Math.round(mark.clientHeight * 2 * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
        render();
        mark.classList.add('is-particle');
      });
      resize.observe(mark);
      canvas.addEventListener('webglcontextlost', dispose, { once: true });
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          gsap.ticker.add(render);
        } else {
          gsap.ticker.remove(render);
        }
      });
      const draw = render;
      render = (time) => {
        if (!tween && (!isHero || !document.documentElement.classList.contains('opener-lock'))) {
          tween = gsap.to(motion, { progress: 1, duration: 2.55, ease: 'none' });
        }
        draw(time);
      };
      observer.observe(mark);
    } catch {
      dispose();
    }
  };
  start();
  return dispose;
}
