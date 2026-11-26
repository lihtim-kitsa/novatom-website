import { buildMaterialCrystal, MATERIALS } from './lattices.js';
import { ELEMENT_COLORS, MATERIAL_ELEMENTS } from './element-colors.js';

export function crystalMotif(material, colors) {
  const { positions, species, bonds } = buildMaterialCrystal(material);
  const sites = Array.from(species, (_, i) => [...positions.subarray(i * 3, i * 3 + 3)]);
  const neighbours = sites.map(() => []);
  for (let i = 0; i < bonds.length; i += 2) {
    const a = bonds[i], b = bonds[i + 1];
    neighbours[a].push(b);
    neighbours[b].push(a);
  }
  // Sites are ordered from the crystal centre outwards. For AlGaN, choose
  // a nitrogen site with both cation species in its local environment.
  const hub = neighbours.findIndex((near, i) => near.length >= 3 && (material.alloy
    ? species[i] === 1 && near.some(j => species[j] === 0) && near.some(j => species[j] === 2)
    : species[i] === 0));
  const near = neighbours[hub];
  const selected = material.alloy
    ? [near.find(i => species[i] === 0), near.find(i => species[i] === 2)]
    : [];
  const indices = [hub, ...selected, ...near.filter(i => !selected.includes(i))].slice(0, 4);

  const center = [0, 1, 2].map(axis => indices.reduce((sum, i) => sum + sites[i][axis], 0) / indices.length);
  const offsets = indices.map(i => sites[i].map((value, axis) => value - center[axis]));
  const span = Math.max(...offsets.map(p => Math.hypot(...p)));
  return offsets.map((p, i) => ({
    position: p.map(value => value / span),
    color: colors[species[indices[i]]],
  }));
}

function buildCloseup(material, colors) {
  const atoms = crystalMotif(material, colors);
  let seed = 173;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const particles = atoms.flatMap(({ position: [x, y, z], color }, i) =>
    Array.from({ length: 670 }, () => {
      const azimuth = random() * Math.PI * 2;
      const vertical = random() * 2 - 1;
      const planar = Math.sqrt(1 - vertical * vertical);
      const radius = (i === 0 ? .3 : .24) * random() ** .53;
      return {
        x: x + radius * planar * Math.cos(azimuth),
        y: y + radius * vertical,
        z: z + radius * planar * Math.sin(azimuth),
        color,
        size: .65 + random() ** 3 * 1.8,
        brightness: .25 + random() * .64,
      };
    }));
  return { atoms, particles };
}

export function initCrystalView(canvas, signal) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let crystal, frame;
  const center = canvas.width / 2;
  const scale = center * .69;
  const tilt = .36;
  const sinTilt = Math.sin(tilt), cosTilt = Math.cos(tilt);
  const cache = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function draw(angle) {
    const { atoms, particles } = crystal;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    function project(x, y, z) {
      const depth = z * cos - x * sin;
      const rotatedZ = y * sinTilt + depth * cosTilt;
      const perspective = 3.8 / (3.8 - rotatedZ);
      return {
        x: center + scale * perspective * (x * cos + z * sin),
        y: center - scale * perspective * (y * cosTilt - depth * sinTilt),
        z: rotatedZ,
        perspective,
      };
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sites = atoms.map(({ position }) => project(...position));
    ctx.beginPath();
    ctx.strokeStyle = '#d4ddf0';
    ctx.globalAlpha = .65;
    ctx.lineWidth = 2;
    for (const site of sites.slice(1)) {
      ctx.moveTo(sites[0].x, sites[0].y);
      ctx.lineTo(site.x, site.y);
    }
    ctx.stroke();

    ctx.globalCompositeOperation = 'lighter';
    for (const particle of particles) {
      const { x, y, z, perspective } = project(particle.x, particle.y, particle.z);
      const radius = particle.size * perspective;
      ctx.globalAlpha = particle.brightness * (.74 + z * .16);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  let angle = .58, previousTime;
  function animate(time) {
    const root = document.documentElement;
    if (!root.classList.contains('has-webgl-field') && !reducedMotion.matches && !root.classList.contains('reduced')) {
      angle += Math.min(time - (previousTime ?? time), 50) * .00020;
      draw(angle);
    }
    previousTime = time;
    frame = requestAnimationFrame(animate);
  }

  const observer = new IntersectionObserver(([entry]) => {
    cancelAnimationFrame(frame);
    previousTime = undefined;
    if (entry.isIntersecting) frame = requestAnimationFrame(animate);
  });
  observer.observe(canvas);
  signal.addEventListener('abort', () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  }, { once: true });

  return index => {
    const material = MATERIALS[index];
    if (!cache.has(index)) {
      const symbols = MATERIAL_ELEMENTS[index];
      const colors = (material.alloy ? [symbols[1], symbols[2], symbols[0]] : symbols)
        .map(symbol => ELEMENT_COLORS[symbol]);
      cache.set(index, buildCloseup(material, colors));
    }
    crystal = cache.get(index);
    canvas.setAttribute('aria-label', `${material.label} four-atom crystal close-up, ${material.structure}`);
    canvas.hidden = false;
    draw(angle);
  };
}
