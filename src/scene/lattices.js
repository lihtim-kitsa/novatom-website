/**
 * Crystal-structure generators.
 *
 * Each builder returns the `count` atoms nearest the crystal centre, so every
 * material is a roundish nugget of the same atom count. Because sites are
 * ordered by distance from the centre, atom i sits on a similar shell in every
 * material, which makes a GPU morph between structures read as the lattice
 * "responding" instead of exploding.
 *
 * Lattice parameters are literature values (angstrom):
 *   GaN wurtzite  a = 3.189, c = 5.185, u = 0.377
 *   4H-SiC        a = 3.073, c = 10.053
 *   HfO2 fluorite a = 5.08  (cubic phase)
 * The structures are schematic: no relaxation, no defects.
 *
 * species: 0 = cation (Ga / Si / Hf), 1 = anion (N / C / O)
 */

const SQRT3_2 = Math.sqrt(3) / 2;

function hexCell(a, c) {
  return {
    a1: [a, 0, 0],
    a2: [-a / 2, a * SQRT3_2, 0],
    a3: [0, 0, c],
  };
}

function frac2cart(cell, f) {
  const { a1, a2, a3 } = cell;
  return [
    f[0] * a1[0] + f[1] * a2[0] + f[2] * a3[0],
    f[0] * a1[1] + f[1] * a2[1] + f[2] * a3[1],
    f[0] * a1[2] + f[1] * a2[2] + f[2] * a3[2],
  ];
}

/** Wurtzite: two interpenetrating hcp lattices, cations and anions. */
function wurtzite(a = 3.189, c = 5.185) {
  const u = 0.377;
  const cell = hexCell(a, c);
  const basis = [
    { f: [1 / 3, 2 / 3, 0], s: 0 },
    { f: [2 / 3, 1 / 3, 0.5], s: 0 },
    { f: [1 / 3, 2 / 3, u], s: 1 },
    { f: [2 / 3, 1 / 3, 0.5 + u], s: 1 },
  ];
  return { cell, basis, range: [13, 13, 9] };
}

/** Idealized 4H-SiC: stacking sequence A-B-A-C along c, Si and C per layer. */
function sic4h() {
  const a = 3.073, c = 10.053;
  const cell = hexCell(a, c);
  const A = [0, 0], B = [1 / 3, 2 / 3], C = [2 / 3, 1 / 3];
  const stack = [A, B, A, C];
  const basis = [];
  stack.forEach((p, k) => {
    basis.push({ f: [p[0], p[1], k / 4], s: 0 });
    basis.push({ f: [p[0], p[1], k / 4 + 3 / 16], s: 1 });
  });
  return { cell, basis, range: [13, 13, 6] };
}

/** Cubic fluorite HfO2: Hf on fcc sites, O on all eight tetrahedral sites. */
function fluorite() {
  const a = 5.08;
  const cell = { a1: [a, 0, 0], a2: [0, a, 0], a3: [0, 0, a] };
  const basis = [];
  for (const f of [[0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]]) {
    basis.push({ f, s: 0 });
  }
  for (const x of [0.25, 0.75]) for (const y of [0.25, 0.75]) for (const z of [0.25, 0.75]) {
    basis.push({ f: [x, y, z], s: 1 });
  }
  return { cell, basis, range: [8, 8, 8] };
}

function nugget({ cell, basis, range }, count) {
  const sites = [];
  for (let i = -range[0]; i <= range[0]; i++)
    for (let j = -range[1]; j <= range[1]; j++)
      for (let k = -range[2]; k <= range[2]; k++)
        for (const b of basis) {
          const p = frac2cart(cell, [i + b.f[0], j + b.f[1], k + b.f[2]]);
          sites.push({ p, s: b.s });
        }

  // centre on the centroid of the cell around the origin, then sort by radius
  let cx = 0, cy = 0, cz = 0;
  for (const b of basis) {
    const p = frac2cart(cell, b.f);
    cx += p[0]; cy += p[1]; cz += p[2];
  }
  cx /= basis.length; cy /= basis.length; cz /= basis.length;
  for (const s of sites) {
    s.p[0] -= cx; s.p[1] -= cy; s.p[2] -= cz;
    s.r = Math.hypot(s.p[0], s.p[1], s.p[2]);
  }
  sites.sort((x, y) => x.r - y.r);
  if (sites.length < count) throw new Error(`lattice supercell too small: ${sites.length} < ${count}`);

  const pick = sites.slice(0, count);
  const R = pick[count - 1].r || 1;
  const positions = new Float32Array(count * 3);
  const species = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    // crystal c-axis (or z) becomes world up (y); normalise to unit radius
    positions[i * 3 + 0] = pick[i].p[0] / R;
    positions[i * 3 + 1] = pick[i].p[2] / R;
    positions[i * 3 + 2] = -pick[i].p[1] / R;
    species[i] = pick[i].s;
  }
  return { positions, species };
}

export const MATERIALS = [
  {
    id: 'gan',
    label: 'GaN',
    structure: 'Wurtzite',
    params: 'a = 3.19 Å, c = 5.19 Å',
    use: 'Power and RF devices',
    build: wurtzite,
  },
  {
    id: 'algan',
    label: 'AlGaN',
    structure: 'Wurtzite alloy',
    params: 'a ≈ 3.17 Å, c ≈ 5.14 Å',
    use: 'Deep-UV optoelectronics',
    build: () => wurtzite(3.17, 5.14),
    alloy: 0.25,
  },
  {
    id: 'sic',
    label: 'SiC',
    structure: '4H polytype',
    params: 'a = 3.07 Å, c = 10.05 Å',
    use: 'High-power electronics',
    build: sic4h,
  },
  {
    id: 'hfo2',
    label: 'HfO₂',
    structure: 'Cubic fluorite',
    params: 'a = 5.08 Å',
    use: 'High-k gate dielectrics',
    build: fluorite,
  },
];

/**
 * First-neighbour bonds between unlike species, found with a spatial hash.
 * Returns a Uint32Array of index pairs for GL_LINES.
 */
function bondPairs({ positions, species }) {
  const n = species.length;
  const P = positions;
  const d2 = (i, j) => {
    const dx = P[i * 3] - P[j * 3], dy = P[i * 3 + 1] - P[j * 3 + 1], dz = P[i * 3 + 2] - P[j * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
  };
  // bond length = shortest cation-anion distance among atoms near the centre (first atoms are central)
  let dmin = Infinity;
  for (let i = 0; i < Math.min(60, n); i++) {
    for (let j = 0; j < Math.min(n, 400); j++) {
      if (species[i] !== species[j]) dmin = Math.min(dmin, d2(i, j));
    }
  }
  const cut = Math.sqrt(dmin) * 1.2;
  const cut2 = cut * cut;
  const cell = cut;
  const key = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  const grid = new Map();
  const cx = (i, a) => Math.floor(P[i * 3 + a] / cell);
  for (let i = 0; i < n; i++) {
    const k = key(cx(i, 0), cx(i, 1), cx(i, 2));
    const arr = grid.get(k);
    if (arr) arr.push(i); else grid.set(k, [i]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const gx = cx(i, 0), gy = cx(i, 1), gz = cx(i, 2);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const arr = grid.get(key(gx + x, gy + y, gz + z));
      if (!arr) continue;
      for (const j of arr) {
        if (j > i && species[i] !== species[j] && d2(i, j) < cut2) out.push(i, j);
      }
    }
  }
  return new Uint32Array(out);
}

export function buildMaterialCrystal(material) {
  const lattice = nugget({ ...material.build(), range: [3, 3, 3] }, 88);
  const bonds = bondPairs(lattice);
  if (material.alloy) {
    const cations = Array.from(lattice.species.keys()).filter(i => lattice.species[i] === 0);
    // Mix cation sites reproducibly and keep the displayed fraction near the nominal composition.
    const siteOrder = i => Math.imul(i + 1, 2654435761) >>> 0;
    cations.sort((a, b) => siteOrder(a) - siteOrder(b));
    for (const i of cations.slice(0, Math.round(cations.length * material.alloy))) lattice.species[i] = 2;
  }
  return { ...lattice, bonds };
}

/**
 * Build the three distinct crystal nuggets (GaN and AlGaN share one).
 * Returns { gan, sic, hfo2 } each { positions, species }.
 */
export function buildLattices(count, { bonds = false } = {}) {
  const out = {
    wurtzite: nugget(wurtzite(), count),
    sic: nugget(sic4h(), count),
    fluorite: nugget(fluorite(), count),
  };
  if (bonds) {
    out.bonds = [bondPairs(out.wurtzite), bondPairs(out.sic), bondPairs(out.fluorite)];
  }
  return out;
}
