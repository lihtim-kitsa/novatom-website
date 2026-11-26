/**
 * GPU point-field shaders (WebGL2 / GLSL ES 3.00).
 *
 * One program draws the atoms (GL_POINTS) and the bonds (GL_LINES, same vertices,
 * uMode = 1). Every point knows its position in seven states, and the director picks
 * any PAIR of states (uA, uB) plus a mix (uM), so the field can morph between any two:
 *
 *   0  search space   loose cloud of candidate structures
 *   1  define         cloud projected onto the property envelope (a box)
 *   2  hypothesise    points gather into ~16 hypothesis clusters
 *   3  simulate       a cobalt scan sweeps the candidate branches
 *   4  validate       uncertain points orbit an oracle ring, confident ones tighten
 *   5  crystal        survivors lock onto lattice sites, bonds appear
 *   6  orbits         three tilted rings around a nucleus
 *
 * On top of any state: phonon ripples (uRipple) travel through the structure like sonar,
 * dust (uDust) keeps the rejected candidates faintly alive, and a burst (uBurst) throws
 * the whole field outward for page transitions. Colours are derived from state
 * membership, never from a scroll scalar, so any pair blends cleanly.
 */

import { ELEMENT_COLORS, MATERIAL_ELEMENTS } from './element-colors.js';
import { MATERIALS } from './lattices.js';
import { crystalMotif } from './crystal-view.js';

const element = (symbol) => {
  const channels = ELEMENT_COLORS[symbol].slice(1).match(/../g);
  return `vec3(${channels.map((value) => (parseInt(value, 16) / 255).toFixed(4)).join(', ')})`;
};

const motifSites = MATERIALS.flatMap((material, i) => {
  const [a, b, c] = MATERIAL_ELEMENTS[i];
  return crystalMotif(material, material.alloy ? [b, c, a] : [a, b]);
});
const motifPositions = motifSites.map(({ position }) =>
  `vec3(${position.map(value => (value * 3.55).toFixed(6)).join(', ')})`).join(', ');
const motifColors = motifSites.map(({ color }) => element(color)).join(', ');

export const vertexShader = /* glsl */ `#version 300 es
precision highp float;
in vec3 position;
uniform mat4 uProj;
in vec4 aSeed;
in vec3 aLat0;
in vec3 aLat1;
in vec3 aLat2;
in float aClass;     // 0 reject, 1 uncertain, 2 confident
in vec3 aSpec;       // species (0 cation, 1 anion) in lattice slots 0,1,2
in vec3 aTxt;        // where this point sits when the points spell the wordmark (state 7)

uniform float uTime;
uniform float uA;
uniform float uB;
uniform float uM;
uniform float uIntro;
uniform float uPx;
uniform float uSize;
uniform float uVel;
uniform float uRotY;
uniform float uRotX;
uniform float uScale;
uniform float uLatR;
uniform vec2  uOffset;
uniform vec2  uMouse;
uniform float uMouseK;
uniform float uMatA;
uniform float uMatB;
uniform float uMatMix;
uniform float uRipple;
uniform float uWaferBoundary;
uniform float uDust;
uniform float uBurst;
uniform float uTwist;     // 1 while the name is dissolving into the crystal: vortex + scatter on the way
uniform vec2  uPar;       // pointer parallax only (the wordmark follows this, never the slow spin)
uniform vec3  uFg;
uniform vec3  uAmber;
uniform vec3  uCobalt;
uniform vec4  uClear;     // text-safe rectangle in NDC: x0 y0 x1 y1
uniform float uClearK;    // 0..1 how strongly points fade inside it
uniform float uMode;      // 0 points, 1 bond lines
uniform float uBondA;     // bond opacity for this draw

out vec3  vColor;
out float vAlpha;

vec3  gC;      // cloud position
vec4  gS;      // seed
float gT;      // time
vec3  gL0, gL1, gL2;

vec3 hash3(float n) {
  return fract(sin(vec3(n, n + 1.37, n + 2.91)) * vec3(43758.5453, 22578.1459, 19642.3490));
}

vec3 flow(vec3 p, float t) {
  return vec3(
    sin(p.y * 0.70 + t * 0.31) + sin(p.z * 1.30 - t * 0.23),
    sin(p.z * 0.80 + t * 0.27) + sin(p.x * 1.10 + t * 0.19),
    sin(p.x * 0.90 + t * 0.29) + sin(p.y * 1.20 - t * 0.17)
  );
}

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

float matSlot(float m) { return m > 2.5 ? 2.0 : (m > 1.5 ? 1.0 : 0.0); }
vec3  latSlot(float s) { return s < 0.5 ? gL0 : (s < 1.5 ? gL1 : gL2); }
float specSlot(float s) { return s < 0.5 ? aSpec.x : (s < 1.5 ? aSpec.y : aSpec.z); }

float matBlend() {
  return smoothstep(0.0, 1.0, clamp(uMatMix * 1.35 - gS.z * 0.35, 0.0, 1.0));
}

vec3 lattice() {
  vec3 a = latSlot(matSlot(uMatA));
  vec3 b = latSlot(matSlot(uMatB));
  vec3 p = mix(a, b, matBlend()) * uLatR;
  p += 0.02 * vec3(
    sin(gT * 1.9 + gS.x * 40.0),
    sin(gT * 1.7 + gS.y * 40.0),
    sin(gT * 2.1 + gS.z * 40.0));   // thermal motion
  return p;
}

// the loose cloud, with differential rotation so it reads as a slow galaxy
vec3 cloud() {
  float r = length(gC.xz);
  vec3 c = rotY(gT * 0.16 / (1.0 + r * 0.45)) * gC;
  return c + flow(gC * 0.55, gT) * 0.38;
}

float scanX() {
  return mix(-4.7, 4.1, min(fract(gT / 5.8) * 1.4, 1.0));
}

vec3 candidateTip(float branch) {
  return vec3(3.1 - 0.35 * abs(branch), branch * 1.32, sin(branch * 1.8) * 1.4);
}

vec3 orbits() {
  if (gS.y < 0.14) {
    return normalize(gS.xzw * 2.0 - 1.0 + 1e-3) * (0.25 + 0.55 * gS.z) + flow(gC, gT) * 0.03;
  }
  float id = floor(gS.w * 2.999);
  float th = gS.x * 6.2831853 + gT * (0.32 + 0.1 * id) * (mod(id, 2.0) < 0.5 ? 1.0 : -1.0);
  float rad = 4.1 + 0.3 * id;
  vec3 v = vec3(cos(th) * rad, sin(th) * rad * 0.42, (gS.z - 0.5) * 0.2);
  float tilt = id < 0.5 ? 0.0 : (id < 1.5 ? 1.05 : -1.05);
  return rotZ(tilt) * rotX(1.1) * v;
}

// state 7: 70% of the points spell the name, 20% circle it on atomic orbits, 10% are far dust that gives depth
vec3 wordmark() {
  if (gS.y < 0.2) {
    float id = floor(gS.w * 2.999);
    float dir = mod(id, 2.0) < 0.5 ? 1.0 : -1.0;
    float th = gS.x * 6.2831853 + gT * (0.30 + 0.10 * id) * dir;
    vec3 v = vec3(cos(th) * 6.7, sin(th) * 3.1, (gS.z - 0.5) * 0.12);
    float roll = id < 0.5 ? 0.0 : (id < 1.5 ? 0.30 : -0.30);
    return rotZ(roll) * rotX(0.95) * v;
  }
  if (gS.y < 0.3) return cloud();
  return aTxt + flow(aTxt * 1.3, gT) * 0.016;
}

// An illustrative atom: volumetric nucleus, faceted cage and three orbital trails.
vec3 orbitPlane(vec3 p, float id) {
  return rotZ(-0.45 + id * 1.05) * rotX(0.93 + id * 0.27) * p;
}

vec2 waferXY() {
  float angle = gS.x * 6.2831853;
  vec2 radial = vec2(cos(angle), sin(angle));
  float radius = 4.5 * sqrt(gS.z);
  if (gS.y < 0.18) return radial * (4.45 + 0.08 * gS.z);
  vec2 xy = radial * radius;
  // Snap some surface samples to die boundaries and finer intra-die traces.
  if (gS.y < 0.72 && radius < 4.0) {
    float pitch = gS.y < 0.53 ? 0.91 : 0.182;
    if (gS.w < 0.5) xy.x = round(xy.x / pitch) * pitch;
    else xy.y = round(xy.y / pitch) * pitch;
  }
  return xy;
}

vec3 wafer() {
  vec2 xy = waferXY();
  // A flattened edge gives the disk a wafer's orientation flat.
  xy.y = max(xy.y, -4.16);
  float depth = gS.y < 0.18 ? -gS.w * 0.34 : (gS.y >= 0.82 ? -0.34 : 0.0);
  if (gS.y > 0.97) {
    float drift = fract(gS.w + gT * 0.13);
    xy = normalize(xy + 0.0001) * (4.46 + drift * 0.7);
    depth = drift * 0.8;
  }
  return rotZ(-0.24) * rotX(-0.88) * rotY(0.18) * vec3(xy, depth);
}

vec3 coreLoop() {
  float station = floor(gS.w * 5.0);
  float angle = gS.y < 0.17 ? 1.570796 - station * 1.256637 : gS.x * 6.2831853;
  float radius = gS.y > 0.85 ? 3.95 : 3.1;
  vec3 ring = vec3(cos(angle), sin(angle), 0.0) * radius;
  vec3 grain = hash3(gS.z * 7213.0) - 0.5;
  float depth = gS.y > 0.85 ? -0.75 : 0.0;
  return ring + grain * (gS.y < 0.17 ? 0.32 : 0.12) + vec3(0.0, 0.0, depth + 0.35 * sin(angle));
}

vec3 atomFigure() {
  float group = gS.y;
  vec3 direction = normalize(hash3(gS.x * 8123.0) - 0.50001);
  if (group < 0.29) {
    return direction * pow(gS.z, 0.65) * 1.65 + 0.05 * flow(direction, gT);
  }
  if (group < 0.40) {
    float edge = floor(gS.w * 12.0);
    float signs = mod(edge, 4.0);
    vec3 p = vec3(signs < 2.0 ? 1.0 : -1.0, 0.0, 0.0);
    vec3 q = vec3(0.0, mod(signs, 2.0) < 1.0 ? 1.0 : -1.0, 0.0);
    if (edge >= 8.0) { p = p.yzx; q = q.yzx; }
    else if (edge >= 4.0) { p = p.zxy; q = q.zxy; }
    return rotZ(0.22) * rotY(0.4) * mix(p, q, gS.x) * 2.15;
  }
  float id = floor(gS.w * 3.0);
  float phase = gT * (0.5 + 0.07 * id) + id * 2.1;
  float angle = group > 0.94 ? phase : gS.x * 6.2831853;
  float radius = 3.7 + 0.35 * id;
  vec3 orbit = vec3(cos(angle) * radius, sin(angle) * radius * 0.79, 0.0);
  float strand = sin(angle * 11.0 + gT * 1.8) * 0.06;
  float spread = group > 0.94 ? 0.26 : pow(gS.z, 3.0) * 0.5;
  return orbitPlane(orbit + vec3(0.0, strand, 0.0), id) + direction * spread;
}

const vec3 questionOrigin = vec3(-3.9, 0.0, 0.0);

const vec3 motifPositions[16] = vec3[16](${motifPositions});
const vec3 motifColors[16] = vec3[16](${motifColors});

bool motifBond() { return gS.y < 0.17; }
int motifSite() {
  return motifBond() ? 1 + int(gS.w * 3.0) : int(gS.w * 4.0);
}

vec3 materialAtomPose(float material) {
  int base = int(floor(material + 0.5)) * 4;
  int site = motifSite();
  vec3 target = motifPositions[base + site];
  vec3 direction = normalize(hash3(gS.x * 8123.0) - 0.50001);
  if (motifBond()) {
    // Each strand runs along a real nearest-neighbour vector from the motif hub.
    vec3 bond = mix(motifPositions[base], target, gS.x);
    return bond + direction * (0.012 + 0.06 * pow(gS.z, 4.0));
  }
  float radius = site == 0 ? 1.08 : 0.88;
  vec3 grain = direction * pow(gS.z, 0.5) * radius;
  grain += 0.055 * flow(grain + float(site), gT);
  return target + grain;
}

vec3 materialElement(float material) {
  int base = int(floor(material + 0.5)) * 4;
  vec3 color = motifColors[base + motifSite()];
  if (!motifBond()) return color;
  float pulse = pow(max(0.0, sin(gS.x * 9.0 - gT * 2.8)), 6.0);
  return mix(mix(motifColors[base], color, gS.x), vec3(1.0), 0.3 + 0.45 * pulse);
}

float ribbonNoise(float t) {
  float cell = floor(t);
  float blend = smoothstep(0.0, 1.0, fract(t));
  return mix(hash3(cell + 17.0).x, hash3(cell + 18.0).x, blend) * 2.0 - 1.0;
}

vec3 cobaltRibbon() {
  float t = fract(gS.x + gT * (0.031 + 0.01 * gS.z));
  float x = mix(-10.5, 10.5, t);
  float wave = x * 0.78 - gT * 0.52;
  float phase = 0.8 * sin(gT * 0.23) + 0.46 * cos(gT * 0.51);
  float bend = ribbonNoise(x * 0.28 + gT * 0.34);
  float y = 0.24 * x + 1.83 * sin(wave + phase + bend * 1.25)
    + 0.62 * sin(x * 1.47 + gT * 0.37) + bend * 0.8;
  float z = 1.7 * cos(x * 0.68 + gT * 0.29)
    + ribbonNoise(x * 0.36 - gT * 0.26 + 9.0) * 1.05;
  float angle = gS.w * 6.2831853;
  float width = 0.78 * sqrt(gS.y) * (0.88 + 0.12 * cos(wave));
  return vec3(x + 0.21 * width * cos(angle), y + width * cos(angle), z + width * sin(angle));
}

vec3 statePos(int k) {
  vec3 r;
  if (k <= 0) {
    r = cloud();
  } else if (k == 1) {
    if (gS.y < 0.72) {
      float t = gS.x;
      float angle = gS.z * 6.2831853 + gT * 0.32;
      float radius = mix(0.12, 2.4, t * t);
      r = questionOrigin + vec3(-t * 2.3, cos(angle) * radius, sin(angle) * radius);
    } else {
      float angle = gS.x * 6.2831853;
      float radius = 1.05 + 0.15 * gS.z;
      r = questionOrigin + vec3((gS.w - 0.5) * 0.22, cos(angle) * radius, sin(angle) * radius);
    }
  } else if (k == 2 || k == 3) {
    // Five candidate directions emerge from one experimental question.
    float branch = floor(gS.w * 5.0) - 2.0;
    vec3 tip = candidateTip(branch);
    float along = gS.y < 0.72 ? gS.x : 1.0;
    r = mix(questionOrigin, tip, along);
    r.yz = tip.yz * smoothstep(0.13, 0.92, along);
    vec3 scatter = clamp(gC, vec3(-5.0), vec3(5.0));
    float passed = smoothstep(r.x, r.x + 0.45, scanX());
    float spread = gS.y < 0.72 ? 0.028 + 0.038 * along : 0.14;
    if (k == 3 && gS.y >= 0.72 && abs(branch) <= 1.0) spread *= mix(1.0, 0.44, passed);
    r += scatter * spread;
    r += 0.04 * flow(r + branch, gT);
    if (k == 3 && gS.y < 0.065) {
      r = vec3(scanX(), (gS.x - 0.5) * 6.8, (gS.z - 0.5) * 4.0);
    }
  } else if (k == 4) {
    r = aClass < 0.5 ? cloud() : rotZ(-0.27) * rotX(0.31) * lattice() * 0.53 - vec3(1.15, 0.0, 0.0);
    if (gS.y < 0.13) {
      float x = gS.x;
      float wave = sin(x * 24.0) * exp(-4.6 * abs(x - 0.38));
      r = vec3(0.85 + 4.4 * x, wave * 1.05, 0.1 + (gS.z - 0.5) * 0.16);
    }
  } else if (k == 5) {
    r = aClass < 0.5 ? cloud() : lattice();
  } else if (k == 6) {
    r = aClass < 0.5 ? cloud() : orbits();
  } else if (k == 7) {
    r = wordmark();
  } else if (k == 8) {
    r = atomFigure();
  } else if (k == 9) {
    r = wafer();
  } else if (k == 10) {
    r = coreLoop();
  } else if (k == 11) {
    r = mix(materialAtomPose(uMatA), materialAtomPose(uMatB), matBlend());
  } else if (k == 13) {
    if (gS.y < 0.28) {
      r = atomFigure() * 0.48 + vec3(1.25, 2.05, 0.9);
    } else if (gS.y < 0.43) {
      float angle = gS.x * 6.2831853;
      vec3 orbit = vec3(cos(angle) * 7.25, sin(angle) * 1.95, 0.0);
      r = rotZ(gS.w < 0.5 ? 0.28 : -0.45) * rotX(0.35) * orbit;
      r += normalize(hash3(gS.z * 2913.0) - 0.50001) * 0.04;
    } else {
      float edge = pow(gS.w, 7.0);
      r = aTxt + (hash3(gS.x * 7109.0) - 0.5) * (0.04 + 0.8 * edge);
    }
  } else {
    r = cobaltRibbon();
  }
  return r;
}

float stateSize(int k) {
  if (k <= 0) return 1.0;
  if (k == 1) return 0.95;
  if (k == 2) return 1.1;
  if (k == 3) return 0.95;
  if (k == 4) return aClass < 0.5 ? 0.8 : 1.35;
  if (k == 5) return aClass < 0.5 ? 0.8 : 1.3;
  if (k == 7) return 1.4;
  if (k == 8 || k == 11) return gS.y > 0.94 ? 1.55 : 0.8;
  if (k == 9) return 0.84;
  if (k == 10) return 0.73;
  if (k == 12) return 0.75 + 0.35 * gS.y;
  return aClass < 0.5 ? 0.8 : 1.1;
}

float stateAlpha(int k) {
  if (k == 3) return 1.0;
  if (k == 7) return 1.0;
  if (k == 8 || k == 11) return gS.y < 0.29 ? 0.38 : (gS.y < 0.40 ? 0.28 : 0.85);
  if (k == 9) return 0.92;
  if (k == 10) return gS.y > 0.85 ? 0.32 : 0.8;
  if (k == 12) {
    float t = fract(gS.x + gT * (0.031 + 0.01 * gS.z));
    return smoothstep(0.0, 0.09, t) * (1.0 - smoothstep(0.91, 1.0, t));
  }
  if (k >= 4) return aClass < 0.5 ? uDust * 0.5 : 1.0;
  return 1.0;
}

float revealOf(int k, float fr) {
  return k == 3 ? fr : ((k >= 4 && k <= 6) ? 1.0 : 0.0);
}

void main() {
  gC = position;
  gS = aSeed;
  gT = uTime;
  gL0 = aLat0; gL1 = aLat1; gL2 = aLat2;

  int k0 = int(uA + 0.5);
  int k1 = int(uB + 0.5);
  float f = clamp(uM, 0.0, 1.0);
  float g = clamp((f - 0.16) / 0.68, 0.0, 1.0);          // dwell at both ends
  float fi = clamp(g * 1.5 - gS.z * 0.5, 0.0, 1.0);        // per-point stagger
  fi = fi * fi * (3.0 - 2.0 * fi);

  // Dwell regions are uniform across the draw. Skip the inactive scene.
  if (g <= 0.0) k1 = k0;
  else if (g >= 1.0) k0 = k1;
  vec3 pA = statePos(k0);
  vec3 pB = k1 == k0 ? pA : statePos(k1);
  vec3 p = mix(pA, pB, fi);
  // the name does not slide into the crystal: it is pulled into a vortex, thrown wide, and falls back onto the lattice
  float bump = sin(3.14159265 * fi) * uTwist;
  if (bump > 0.0) {
    float r0 = length(p.xy);
    p = rotZ(bump * (4.6 / (1.0 + r0 * 0.32)) * (0.55 + 0.9 * gS.z)) * p;
    p = rotY(bump * 1.7 * (gS.y - 0.5)) * p;
    p += normalize(p + 1e-3) * bump * (0.3 + gS.w) * 2.4;
    p.z += bump * (gS.w - 0.5) * 3.0;
  }
  float size = mix(stateSize(k0), stateSize(k1), fi);
  float alpha = mix(stateAlpha(k0), stateAlpha(k1), fi);

  // ---- colours from state membership
  float fr = 0.0;
  float revealed = mix(revealOf(k0, fr), revealOf(k1, fr), fi);
  float isL0 = step(4.5, float(k0)) * step(float(k0), 6.5);
  float isL1 = step(4.5, float(k1)) * step(float(k1), 6.5);
  float settled = mix(isL0, isL1, fi);
  float latW = mix(isL0, isL1, fi);
  float orb = mix(step(5.5, float(k0)) * step(float(k0), 6.5), step(5.5, float(k1)) * step(float(k1), 6.5), fi);
  float txtW = mix(float(k0 == 7), float(k1 == 7), fi);
  float atomW = mix(float(k0 == 8), float(k1 == 8), fi);
  float materialAtomW = mix(float(k0 == 11), float(k1 == 11), fi);
  // groups inside the wordmark state
  float ringW = txtW * step(gS.y, 0.2);
  float dustW = txtW * step(0.2, gS.y) * step(gS.y, 0.3);
  float elec = step(0.985, gS.z) * ringW;                      // a few bright electrons on the orbits
  float sx = mix(-8.0, 8.0, fract(gT * 0.14));                   // a glint sweeps across the letters
  float glint = txtW * step(0.3, gS.y) * exp(-pow((aTxt.x - sx) / 0.9, 2.0));
  size *= (1.0 - 0.35 * ringW) * (1.0 + 2.2 * elec) * (1.0 + 0.8 * glint) * (1.0 - 0.45 * dustW);
  alpha *= (1.0 - 0.45 * ringW) * (1.0 - 0.6 * dustW);
  alpha += 0.8 * elec;
  float shimmer = txtW * (1.0 - ringW) * (1.0 - dustW);
  size *= 1.0 + 0.45 * shimmer * max(0.0, sin(aTxt.x * 1.5 - gT * 1.7 + aTxt.y * 0.8));
  alpha *= 1.0 - 0.28 * shimmer * (0.5 + 0.5 * sin(gT * 2.3 + gS.x * 60.0));

  float surv = step(0.5, aClass);
  vec3 cls;
  float clsAlpha = 1.0;
  if (aClass < 0.5) {
    cls = uFg;
    clsAlpha = mix(1.0, 0.5, revealed);
  } else if (aClass < 1.5) {
    cls = mix(uFg, mix(uAmber, uCobalt, settled), revealed);
  } else {
    cls = mix(uFg, uCobalt, revealed);
  }

  float blend = matBlend();
  float spec = mix(specSlot(matSlot(uMatA)), specSlot(matSlot(uMatB)), step(0.5, blend));
  float alloy = mix(step(abs(uMatA - 1.0), 0.5), step(abs(uMatB - 1.0), 0.5), step(0.5, blend));
  vec3 atom = spec > 0.5 ? uCobalt : uFg;
  if (spec < 0.5 && alloy > 0.5 && gS.w < 0.25) atom = uAmber;
  float w5 = latW * surv;
  vec3 col = mix(cls, atom, w5);
  float hypothesisW = mix(float(k0 == 1 || k0 == 2), float(k1 == 1 || k1 == 2), fi);
  float signal = pow(0.5 + 0.5 * sin(gS.x * 24.0 - gT * 2.8), 5.0);
  vec3 hypothesisColor = mix(uCobalt * 0.65, uFg, gS.y < 0.72 ? signal * 0.6 : 0.85);
  col = mix(col, hypothesisColor, hypothesisW);
  float screenW = mix(float(k0 == 3), float(k1 == 3), fi);
  float branch = floor(gS.w * 5.0) - 2.0;
  float passed = smoothstep(p.x, p.x + 0.45, scanX());
  float flash = exp(-pow((p.x - scanX()) / 0.34, 2.0));
  float selected = step(abs(branch), 1.0);
  vec3 screened = mix(hypothesisColor, mix(mix(uCobalt, uFg, 0.18), vec3(1.0), selected), passed);
  screened = mix(screened, vec3(1.0), flash);
  float plane = step(gS.y, 0.065);
  col = mix(col, mix(screened, uCobalt, plane), screenW);
  alpha *= mix(1.0, mix(1.0 - passed * (1.0 - selected) * 0.12, 0.45, plane), screenW);
  size *= 1.0 + screenW * (1.1 * flash + mix(0.22, 0.32, selected) * passed) * (1.0 - plane);
  float measureW = mix(float(k0 == 4), float(k1 == 4), fi) * surv;
  // A pulse crosses the growing specimen and decays as the signal returns.
  float travel = fract(gT * 0.46);
  float probe = mix(-5.0, 5.0, 1.0 - abs(2.0 * travel - 1.0));
  float response = exp(-pow((p.x - probe) / 0.42, 2.0)) * measureW;
  col = mix(col, mix(uCobalt, vec3(1.0), 0.75), response);
  size *= 1.0 + response * 0.9;
  float trace = mix(float(k0 == 4), float(k1 == 4), fi) * step(gS.y, 0.13);
  float traceReveal = smoothstep(gS.x, gS.x + 0.12, travel * 1.9 - 0.42);
  col = mix(col, mix(uCobalt, uFg, 0.25), trace);
  alpha = mix(alpha, traceReveal, trace);
  size *= 1.0 + trace * 0.55;


  float oid = floor(gS.w * 2.999);
  vec3 orbCol = gS.y < 0.14 ? uFg : (oid < 0.5 ? uCobalt : (oid < 1.5 ? uAmber : uFg));
  col = mix(col, orbCol, orb * surv);
  vec3 txtCol = gS.w < 0.1 ? uCobalt : uFg;                   // the wordmark: white with cobalt sparks
  txtCol = mix(txtCol, mix(uFg, uCobalt, 0.65), step(gS.y, 0.2)); // orbits lean cobalt
  col = mix(col, txtCol, txtW);
  float missingW = mix(float(k0 == 13), float(k1 == 13), fi);
  if (missingW > 0.0) {
    vec3 missingInk = gS.y < 0.28 ? mix(uCobalt, uFg, 0.62) : (gS.y < 0.43 ? uCobalt : uFg);
    col = mix(col, missingInk, missingW);
    alpha *= mix(1.0, gS.y < 0.28 ? 0.95 : (gS.y < 0.43 ? 0.28 : 0.9), missingW);
  }
  col = mix(col, vec3(0.184, 0.42, 0.941), atomW * step(0.40, gS.y));
  if (materialAtomW > 0.0) col = mix(col, mix(materialElement(uMatA), materialElement(uMatB), blend), materialAtomW);
  alpha *= mix(1.0, motifBond() ? 0.42 : 0.76, materialAtomW);
  size *= mix(1.0, motifBond() ? 0.76 : 1.08, materialAtomW);
  float waferW = mix(float(k0 == 9), float(k1 == 9), fi);
  float coreW = mix(float(k0 == 10), float(k1 == 10), fi);
  float ribbonW = mix(float(k0 == 12), float(k1 == 12), fi);
  vec3 cobalt = vec3(0.184, 0.42, 0.941);
  float edgeLight = smoothstep(-0.4, 1.0, cos(gS.w * 6.2831853));
  col = mix(col, mix(cobalt * 0.84, mix(cobalt, uFg, 0.36), edgeLight), ribbonW);
  size *= 1.0 + 0.08 * ribbonW;
  if (coreW > 0.0) {
    float loopPhase = fract(0.25 - atan(p.y, p.x) / 6.2831853);
    float trail = 1.0 - smoothstep(0.0, 0.20, fract(gT / 9.0 - loopPhase));
    col = mix(col, mix(uCobalt * 0.50, uFg, trail * trail), coreW);
    size *= 1.0 + coreW * trail * 0.75;
  }
  if (waferW > 0.0) {
    bool rim = gS.y < 0.18;
    bool etched = gS.y >= 0.18 && gS.y < 0.72;
    // Reset beyond the rim, where the traveling light is already invisible.
    float sweepX = mix(-6.0, 6.0, fract(gT / 5.2));
    float waferX = waferXY().x;
    float sweep = exp(-pow((waferX - sweepX) / 0.29, 2.0));
    float exposed = 0.55 + 0.45 * sweep;
    vec3 waferColor = rim ? uFg * 0.74 : mix(vec3(0.08, 0.10, 0.15), uCobalt * 0.75, exposed * (etched ? 1.0 : 0.32));
    float rimLight = 0.45 + 0.55 * gS.w;
    waferColor *= rim ? rimLight : (gS.y >= 0.82 ? 0.52 : 1.0);
    col = mix(col, mix(waferColor, uCobalt + vec3(0.35), sweep), waferW);
    alpha *= mix(1.0, rim ? 0.9 : (etched ? 0.8 : 0.3), waferW);
    size *= mix(1.0, 1.0 + sweep * 0.55, waferW);
  }
  col += glint * vec3(0.55, 0.7, 1.0);
  float sizeSpec = mix(1.0, spec > 0.5 ? 1.0 : 1.55, w5 * (1.0 - orb));

  // ---- phonon ripples: sonar rings travelling outward through whatever structure is on screen
  float rr = length(p);
  float wv = sin(rr * 2.3 - gT * 2.2);
  p += normalize(p + 1e-3) * wv * uRipple * 0.10 * (0.4 + 0.6 * gS.z);
  float glow = pow(max(0.0, wv), 10.0) * uRipple * exp(-rr * 0.10);
  col += glow * (uCobalt * 0.9 + vec3(0.25));
  size *= 1.0 + glow * 1.1;
  alpha += glow * 0.5;

  // ---- intro: points arrive from far away
  float ie = clamp(uIntro * 1.5 - mix(gS.x, clamp((aTxt.x + 6.0) / 12.0, 0.0, 1.0), txtW) * 0.5, 0.0, 1.0);
  ie = 1.0 - pow(1.0 - ie, 3.0);
  p = mix(p * 2.4 + (gS.zyx - 0.5) * 18.0, p, ie);
  alpha *= ie;

  // ---- page-transition burst: everything is thrown outward and falls back
  p += normalize(p + 1e-3) * uBurst * (2.0 + gS.z * 7.0);
  alpha *= 1.0 - uBurst * 0.35;

  // ---- global transform
  p *= uScale;
  float ry = mix(mix(uRotY, sin(gT * 0.32) * 0.45 + uPar.x, atomW + materialAtomW), uPar.x * 0.4, txtW);
  ry = mix(ry, sin(gT * 0.38) * 0.24 + uPar.x * 0.7, waferW);
  float rx = mix(0.1 + uRotX, uPar.y * 0.4, txtW);
  rx += waferW * (0.14 * cos(gT * 0.38) + uPar.y * 0.6);
  ry = mix(ry, uPar.x * 0.45, coreW);
  rx = mix(rx, uPar.y * 0.45, coreW);
  ry = mix(ry, uPar.x * 0.23, ribbonW);
  rx = mix(rx, uPar.y * 0.17, ribbonW);
  p = rotX(rx) * rotY(ry) * p;
  p.xy += uOffset;
  p.y += uVel * (0.35 + gS.z) * 0.9 * (1.0 - coreW);

  vec2 d = p.xy - uMouse;
  float r2 = dot(d, d);
  float push = exp(-r2 / 3.2) * uMouseK * mix(1.0, 0.12, max(waferW, coreW));
  p.xy += normalize(d + 1e-4) * push * 1.1;
  p.z  += push * (gS.w - 0.5) * 1.6;

  vec4 mv = vec4(p.x, p.y, p.z - 18.0, 1.0);   // camera sits at z = 18
  float depth = max(-mv.z, 0.5);
  gl_Position = uProj * mv;
  if (-mv.z < 0.3) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }   // behind the camera: cull

  float fade = clamp(1.0 - (depth - 15.0) / 24.0, 0.25, 1.0);

  vec2 ndc = gl_Position.xy / gl_Position.w;
  float soft = 0.22;
  float inX = smoothstep(uClear.x - soft, uClear.x + soft, ndc.x) * (1.0 - smoothstep(uClear.z - soft, uClear.z + soft, ndc.x));
  float inY = smoothstep(uClear.y - soft, uClear.y + soft, ndc.y) * (1.0 - smoothstep(uClear.w - soft, uClear.w + soft, ndc.y));
  float clear = 1.0 - uClearK * 0.93 * inX * inY;
  clear *= 1.0 - 0.9 * smoothstep(0.80, 0.93, ndc.y);

  if (uMode > 0.5) {
    vColor = mix(uFg, uCobalt, 0.6);
    // bonds fade out early while a crystal dissolves, and in late while one forms
    float bf = 1.0;
    if (k0 >= 5 && k1 < 5) bf = 1.0 - smoothstep(0.0, 0.35, f);
    else if (k0 < 5 && k1 >= 5) bf = smoothstep(0.65, 1.0, f);
    else if (k0 == 7) bf = smoothstep(0.5, 0.84, f);
    vAlpha = 1.25 * uBondA * latW * surv * (1.0 - orb) * (1.0 - trace) * alpha * clear * fade * bf;
    return;
  }

  float screenY = 0.5 - ndc.y * 0.5;
  float edgeFade = smoothstep(0.035, 0.23, uWaferBoundary - screenY);
  float exitFade = smoothstep(0.62, 0.96, uWaferBoundary);
  alpha *= mix(1.0, edgeFade * exitFade, waferW);
  vAlpha = alpha * clsAlpha * fade * clear * mix(0.95, 1.0, txtW);
  vColor = col;

  float base = (0.75 + 1.25 * gS.z * gS.z * gS.z) * uSize * size * sizeSpec * mix(1.12, 1.0, txtW);
  gl_PointSize = clamp(base * uPx * (18.0 / depth), 1.0, 56.0);
}
`;

export const fragmentShader = /* glsl */ `#version 300 es
precision mediump float;
in vec3  vColor;
in float vAlpha;
uniform highp float uMode;
out vec4 fragColor;

void main() {
  float a = vAlpha;
  if (uMode < 0.5) {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = 1.0 - smoothstep(0.0, 0.55, d);
    float halo = pow(1.0 - clamp(d, 0.0, 1.0), 2.2);
    a *= core * 0.8 + halo * 0.45;          // bright core with a soft glow
  }
  if (a < 0.01) discard;
  fragColor = vec4(vColor * a, a);   // premultiplied, blended additively
}
`;
