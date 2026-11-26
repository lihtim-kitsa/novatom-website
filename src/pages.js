import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { MATERIALS } from './scene/lattices.js';
import { ELEMENT_COLORS, MATERIAL_ELEMENTS } from './scene/element-colors.js';
import { initCrystalView } from './scene/crystal-view.js';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------------ headings: masked line rise, reactive letters on display type */
export function initHeadings(env) {
  $$('main [data-split]').forEach((el) => {
    const hero = el.classList.contains('display');
    const react = el.hasAttribute('data-react') && !env.reduced;
    SplitText.create(el, {
      type: react ? 'lines, words, chars' : 'lines',
      mask: 'lines', autoSplit: true, maskClass: 'split-mask', charsClass: 'char', wordsClass: 'word',
      onSplit(self) {
        if (react && self.chars) env.reactive.add(self.chars);
        if (env.reduced) return undefined;
        if (hero) return undefined;
        return gsap.from(self.lines, {
          yPercent: 108, duration: 1.0, ease: 'expo.out', stagger: 0.08,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
      },
    });
  });
}

/* ------------------------------------------------------------------ per-frame DOM driven by the director (home) */
export function createPageTicker() {
  const heroTrack = $('.hero-track');
  const stepEls = $$('.step');
  const stepsList = $('#steps');
  const stepLive = $('#stepLive');
  const space = $('#space');
  const bnExp = $('#bnExp');
  const NAMES = ['Define', 'Hypothesise', 'Screen', 'Make & Measure', 'Learn'];
  let activeStep = -1, lastProgress = -1, lastExp = '', lastDa = -1, lastSb = -1;
  let lastMission = -1;

  return (T) => {
    if (heroTrack) {
      const mission = Math.round((T.hm ?? 1) * 1000) / 1000;
      if (mission !== lastMission) {
        heroTrack.style.setProperty('--hero-mission', mission);
        heroTrack.classList.toggle('show-hero-mission', mission > 0);
        lastMission = mission;
      }
    }
    if (stepsList) {
      const progress = Math.round(T.lp * 1000);
      if (progress !== lastProgress) {
        stepsList.style.setProperty('--p', progress / 1000);
        lastProgress = progress;
      }
      const stage = T.lp * 5;
      const n = stage < 0.45 ? 0 : clamp(Math.round(stage), 1, 5);
      if (n !== activeStep) {
        activeStep = n;
        stepEls.forEach((el, i) => { el.classList.toggle('is-active', i + 1 === n); const b = el.querySelector('.step-btn'); if (b) b.setAttribute('aria-current', i + 1 === n ? 'step' : 'false'); });
        if (n > 0 && stepLive) stepLive.textContent = `Step ${n} of 5: ${NAMES[n - 1]}`;
      }
    }
    if (space) {
      const da = Math.round(T.da * 100) / 100, sb = Math.round(T.sb * 100) / 100;
      if (da !== lastDa) { space.style.setProperty('--da', da); lastDa = da; }
      if (sb !== lastSb) { space.style.setProperty('--sb', sb); lastSb = sb; }
    }
    if (bnExp) {
      const ex = String(Math.round(lerp(1, 8, sstep(0.4, 0.8, T.sp))));
      if (ex !== lastExp) { bnExp.textContent = ex; lastExp = ex; }
    }
  };
}

/* ------------------------------------------------------------------ ledger: one number escalating in trust */
function revealRow(tl, r, at) {
  tl.to(r, { clipPath: 'inset(0 0% 0 0)', duration: 1.1 }, at);
  const n = r.querySelector('.num');
  if (n) {
    const to = parseFloat(n.dataset.to), dec = parseInt(n.dataset.dec, 10), o = { v: 0 };
    tl.to(o, { v: to, duration: 1.1, onUpdate: () => { n.textContent = o.v.toFixed(dec); } }, at);
  }
  const bar = r.querySelector('.bar'), pt = r.querySelector('.pt');
  if (bar) tl.to(bar, { scaleX: 1, duration: 1.0 }, at + 0.3);
  if (pt) tl.to(pt, { opacity: 1, duration: 0.4 }, at + 0.9);
}

function initLedger(env) {
  const rows = $$('.lrow');
  if (!rows.length || env.reduced) return;
  rows.forEach((r) => gsap.set(r, { clipPath: 'inset(0 100% 0 0)' }));
  gsap.set('.bar', { scaleX: 0, transformOrigin: '50% 50%' });
  gsap.set('.pt', { opacity: 0 });
  const ladder = $('#ladder');
  if (ladder) gsap.set(ladder, { '--m': 1 });

  // the page opens already working: an estimate arrives, then a simulation supersedes it
  const intro = gsap.timeline({ delay: 1.0, defaults: { ease: 'power2.out' } });
  revealRow(intro, rows[0], 0);
  revealRow(intro, rows[1], 1.1);
  if (ladder) intro.to(ladder, { '--m': 2, duration: 1.0, ease: 'power2.inOut' }, 1.3);
  intro.to(rows[0], { opacity: 0.72, duration: 0.8 }, 2.2);

  // scroll carries it to the physical experiment, which waits for a person's approval
  const mm = gsap.matchMedia();
  const rest = (cfg) => {
    const tl = gsap.timeline({ scrollTrigger: cfg, defaults: { ease: 'power2.out' } });
    revealRow(tl, rows[2], 0.6);
    if (ladder) tl.to(ladder, { '--m': 3, duration: 1.2, ease: 'power2.inOut' }, 0.6);
    tl.to({}, { duration: 2.0 }, 1.8);
    return tl;
  };
  mm.add('(min-width: 981px)', () => { rest({ trigger: '#ledger', start: 'top top', end: 'bottom bottom', scrub: 0.6 }); });
  mm.add('(max-width: 980px)', () => { rest({ trigger: '#ledgerFig', start: 'top 60%', once: true }).timeScale(1.4); });
}

/* ------------------------------------------------------------------ scrubbed line that lights each step as you pass */
function scrubLine(el, animated) {
  if (!el) return;
  const items = $$('li', el);
  const lit = (p) => items.forEach((li, i) => li.classList.toggle('is-on', p >= i / (items.length - 1) - 0.001));
  if (!animated) { el.style.setProperty('--p', 1); lit(1); return; }
  lit(0);
  ScrollTrigger.create({
    trigger: el, start: 'top 78%', end: 'bottom 45%', scrub: true,
    onUpdate: (self) => { el.style.setProperty('--p', self.progress.toFixed(3)); lit(self.progress); },
  });
}

function initKronig(env) {
  const animated = !env.reduced;
  scrubLine($('#pipe'), animated);
  scrubLine($('#miles'), animated);
  if (!animated || !$('#bars')) return;
  $$('#bars li').forEach((li) => {
    const fill = $('.bar-f', li), val = $('.bar-v', li), to = parseFloat(val.dataset.to), o = { v: 0 };
    const tl = gsap.timeline({ scrollTrigger: { trigger: li, start: 'top 88%', once: true } });
    tl.from(fill, { scaleX: 0, duration: 1.4, ease: 'power3.out' }, 0);
    tl.to(o, { v: to, duration: 1.4, ease: 'power3.out', onUpdate: () => { val.textContent = o.v.toFixed(1) + '%'; } }, 0);
  });

}

/* ------------------------------------------------------------------ inverse design: a target walks the band-gap curve */
const EG = (x) => 3.42 * (1 - x) + 6.2 * x - 1.09 * x * (1 - x);
function initInverse(env) {
  const svg = $('#invSvg');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const X0 = 56, XW = 520, Y0 = 296, YH = 280, EMIN = 3.0, EMAX = 6.4;
  const px = (x) => X0 + x * XW, py = (e) => Y0 - ((e - EMIN) / (EMAX - EMIN)) * YH;
  const mk = (tag, attrs, parent, text) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (text != null) el.textContent = text;
    parent.appendChild(el);
    return el;
  };
  const eOf = (nm) => 1239.84 / nm;
  const bands = $('#invBands'), grid = $('#invGrid');
  bands.innerHTML = ''; grid.innerHTML = '';
  [['UV-C', EMAX, eOf(280)], ['UV-B', eOf(280), eOf(315)], ['UV-A', eOf(315), eOf(400)]].forEach(([name, hi, lo], i) => {
    if (i !== 1) mk('rect', { class: 'inv-band', x: X0, y: py(hi), width: XW, height: py(lo) - py(hi) }, bands);
    mk('text', { class: 'inv-bandl', x: X0 + XW - 8, y: py(hi) + 18, 'text-anchor': 'end' }, bands, name);
  });
  for (let i = 0; i <= 4; i++) {
    const x = i / 4;
    mk('line', { class: 'inv-axis', x1: px(x), x2: px(x), y1: py(EMIN), y2: py(EMIN) + 5 }, grid);
    mk('text', { class: 'inv-tick', x: px(x), y: py(EMIN) + 20, 'text-anchor': 'middle' }, grid, x === 0 ? '0' : x === 1 ? '1' : x.toFixed(2));
  }
  [3, 4, 5, 6].forEach((e) => {
    mk('line', { class: 'inv-axis', x1: X0 - 5, x2: X0 + XW, y1: py(e), y2: py(e) }, grid);
    mk('text', { class: 'inv-tick', x: X0 - 10, y: py(e) + 4, 'text-anchor': 'end' }, grid, String(e));
  });
  mk('text', { class: 'inv-title', x: X0 + XW / 2, y: py(EMIN) + 40, 'text-anchor': 'middle' }, grid, 'Aluminium fraction x');
  mk('text', { class: 'inv-title', transform: `translate(14 ${py(4.7)}) rotate(-90)`, 'text-anchor': 'middle' }, grid, 'Band gap, eV');

  let d = '';
  for (let i = 0; i <= 100; i++) { const x = i / 100; d += (i ? 'L' : 'M') + px(x).toFixed(1) + ' ' + py(EG(x)).toFixed(1); }
  const curve = $('#invCurve');
  curve.setAttribute('d', d);
  const dot = $('#invDot'), gv = $('#invGv'), gh = $('#invGh'), rx = $('#invX'), re = $('#invE'), rl = $('#invL');
  const place = (x) => {
    const e = EG(x), X = px(x), Y = py(e);
    dot.setAttribute('cx', X); dot.setAttribute('cy', Y);
    gv.setAttribute('x1', X); gv.setAttribute('x2', X); gv.setAttribute('y1', Y); gv.setAttribute('y2', py(EMIN));
    gh.setAttribute('x1', X0); gh.setAttribute('x2', X); gh.setAttribute('y1', Y); gh.setAttribute('y2', Y);
    rx.textContent = 'Al fraction ' + x.toFixed(2); re.textContent = e.toFixed(2) + ' eV'; rl.textContent = Math.round(1239.84 / e) + ' nm';
  };
  const TARGET = 0.46;
  place(TARGET);
  if (env.reduced) return;
  const len = curve.getTotalLength(), rows = $$('#recipe > div'), st = { x: 0 };
  gsap.set(curve, { strokeDasharray: len, strokeDashoffset: len });
  gsap.set(rows, { opacity: 0 });
  place(0);
  const tl = gsap.timeline({ scrollTrigger: { trigger: '.invchart', start: 'top 70%', once: true } });
  tl.to(curve, { strokeDashoffset: 0, duration: 1.8, ease: 'power2.inOut' }, 0);
  tl.to(st, { x: TARGET, duration: 2.6, ease: 'power3.inOut', onUpdate: () => place(st.x) }, 0.3);
  tl.to(rows, { opacity: 1, duration: 0.5, stagger: 0.12, ease: 'power2.out' }, 2.4);
}

/* ------------------------------------------------------------------ why now: the chip market bars */
function initWhyNow(env) {
  if (!$('#mkt') || env.reduced) return;
  $$('.mkt-col').forEach((col, i) => {
    const bar = $('.mkt-b', col), val = $('.mkt-v', col), to = parseFloat(val.dataset.to), o = { v: 0 };
    const tl = gsap.timeline({ scrollTrigger: { trigger: '#mkt', start: 'top 80%', once: true } });
    tl.from(bar, { scaleY: 0, duration: 1.3, ease: 'power3.out' }, i * 0.18);
    tl.to(o, { v: to, duration: 1.3, ease: 'power3.out', onUpdate: () => { val.textContent = '$' + o.v.toFixed(2) + 'T'; } }, i * 0.18);
  });
  gsap.from('.mkt-x', { opacity: 0, duration: 0.8, ease: 'power2.out', scrollTrigger: { trigger: '#mkt', start: 'top 75%', once: true }, delay: 0.9 });
}

/* ------------------------------------------------------------------ materials picker + explore-link hover */
function initMaterials(env) {
  const btns = $$('.mat');
  if (!btns.length) return;
  const nameEl = $('#structName'), paramEl = $('#structParams');
  const note = $('#crystalNote');
  const canvas = $('#nexconCrystal');
  const showCrystal = canvas && initCrystalView(canvas, env.signal);
  const legend = $('#elementLegend');
  function showElements(i) {
    legend?.replaceChildren(...MATERIAL_ELEMENTS[i].map((symbol) => {
      const item = document.createElement('li');
      item.textContent = symbol;
      item.style.setProperty('--element-color', ELEMENT_COLORS[symbol]);
      return item;
    }));
  }
  let target = -1, hoverT = 0;
  function select(i) {
    if (i === target) return;
    target = i;
    btns.forEach((b, j) => { b.classList.toggle('is-on', j === i); b.setAttribute('aria-pressed', String(j === i)); });
    const material = MATERIALS[i];
    nameEl.textContent = material.structure;
    paramEl.textContent = material.params;
    note.textContent = material.alloy
      ? 'Four neighbouring sites in a representative Al₀.₂₅Ga₀.₇₅N lattice. The lattice parameters are estimated.'
      : 'Four sites from the crystal lattice. Particle strands trace nearest-neighbour connections.';
    showElements(i);
    showCrystal?.(i);
    env.morph(i);
  }
  select(0);
  btns.forEach((b, i) => {
    b.addEventListener('click', () => select(i), { signal: env.signal });
    b.addEventListener('focus', () => select(i), { signal: env.signal });
    b.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(hoverT); hoverT = setTimeout(() => select(i), 90); }, { signal: env.signal });
    b.addEventListener('pointerleave', () => clearTimeout(hoverT), { signal: env.signal });
  });
}

function initExploreHover(env) {
  $$('.explore-list a[data-mat]').forEach((a) => {
    a.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') env.morph(parseInt(a.dataset.mat, 10)); }, { signal: env.signal });
    a.addEventListener('focus', () => env.morph(parseInt(a.dataset.mat, 10)), { signal: env.signal });
  });
}

/* ------------------------------------------------------------------ the core loop and its domain packs */
const CORE_STAGES = ['Define', 'Hypothesise', 'Screen', 'Make & Measure', 'Learn'];
const PACKS = [
  { name: 'Semiconductors', prod: 'NexCon-03', status: 'Live', slots: ['Alloys, dopants and stacks', 'DFT and TCAD simulation', 'Deposition, XRD, Hall', 'Band ordering, convergence', 'Gas, temperature, vacuum'] },
  { name: 'Drug discovery', prod: 'NexPharma-01', status: 'Planned', slots: ['Ligands and targets', 'Docking and ADMET models', 'Assays and plate readers', 'Selectivity and toxicity flags', 'Biosafety level, dose'] },
  { name: 'Catalysis', prod: 'NexCat-01', status: 'Planned', slots: ['Surfaces and compositions', 'Reaction-energy models', 'Reactors and gas analysis', 'Mass balance, stability', 'Pressure, temperature'] },
  { name: 'Quantum materials', prod: 'NexQM-01', status: 'Planned', slots: ['Lattices and couplings', 'Many-body models', 'Cryostat and transport', 'Symmetry, sum rules', 'Cryogen and field limits'] },
  { name: 'Your field', prod: 'You define it', status: '', slots: ['What may be proposed', 'How it is predicted', 'What can run it', 'What counts as sane', 'What must never happen'] },
];

function initCore(env) {
  const svg = $('#coreSvg');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const CX = 300, CY = 280, R = 140;
  const mk = (tag, attrs, parent, text) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (text != null) el.textContent = text;
    parent.appendChild(el);
    return el;
  };
  const nodesG = $('#coreNodes'), busG = $('#coreBus'), satG = $('#coreSats');
  nodesG.innerHTML = ''; busG.innerHTML = ''; satG.innerHTML = '';
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / 5;

  // five stage nodes with their labels
  const nodes = CORE_STAGES.map((name, i) => {
    const a = ang(i), x = CX + R * Math.cos(a), y = CY + R * Math.sin(a);
    const g = mk('g', { class: 'c-node' }, nodesG);
    mk('circle', { cx: x, cy: y, r: 11 }, g);
    mk('text', { class: 'c-num', x, y: y + 4, 'text-anchor': 'middle' }, g, String(i + 1));
    const lx = CX + (R + 40) * Math.cos(a), ly = CY + (R + 40) * Math.sin(a);
    const c = Math.cos(a);
    mk('text', { class: 'c-label', x: lx, y: ly + 5, 'text-anchor': c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle' }, g, name);
    return g;
  });

  // five thin bus lines fan out from the ring to the pack on the right
  const rows = 5;
  for (let i = 0; i < rows; i++) {
    const y = CY - 64 + i * 32;
    mk('path', { class: 'bus', d: `M ${CX + R + 4} ${CY + (i - 2) * 9} C ${CX + R + 70} ${CY + (i - 2) * 9}, ${CX + R + 100} ${y}, 598 ${y}` }, busG);
  }
  // satellites on the outer orbit
  const sats = [0.4, 2.3, 4.2].map((a0) => mk('circle', { class: 'c-sat', r: 4, cx: CX + 212 * Math.cos(a0), cy: CY + 212 * Math.sin(a0) }, satG));

  // the first pack is already in the markup; wire the tabs
  const tabs = $$('.packtab');
  const title = $('#packTitle'), prod = $('#packProd'), status = $('#packStatus');
  const slotEls = $$('#packSlots dd');
  let cur = 0, auto = null, userTouched = false;

  const setStatic = (i) => {
    const pk = PACKS[i];
    title.textContent = pk.name; prod.textContent = pk.prod; status.textContent = pk.status; status.hidden = !pk.status;
    status.className = 'pm-status' + (pk.status === 'Live' ? ' is-live' : '');
    slotEls.forEach((el, k) => { el.textContent = pk.slots[k]; });
    tabs.forEach((t, k) => { t.classList.toggle('is-on', k === i); t.setAttribute('aria-pressed', String(k === i)); });
  };

  const flash = gsap.timeline({ paused: true });
  flash.fromTo('.bus', { strokeOpacity: 0.25 }, { strokeOpacity: 1, duration: 0.25, stagger: 0.04, yoyo: true, repeat: 1, ease: 'power1.inOut' });
  flash.fromTo('.c-ring', { strokeOpacity: 0.5 }, { strokeOpacity: 1, duration: 0.3, yoyo: true, repeat: 1 }, 0);

  function setPack(i, byUser) {
    if (i === cur) return;
    cur = i;
    const pk = PACKS[i];
    tabs.forEach((t, k) => { t.classList.toggle('is-on', k === i); t.setAttribute('aria-pressed', String(k === i)); });
    if (env.reduced) { setStatic(i); return; }
    const card = $('#packCard');
    gsap.fromTo(card, { x: 34, opacity: 0.5 }, { x: 0, opacity: 1, duration: 0.7, ease: 'power3.out' });
    flash.restart();
    gsap.to(title, { duration: 0.6, scrambleText: { text: pk.name, chars: 'abcdefghijklmnopqrstuvwxyz', speed: 0.8 } });
    gsap.to(prod, { duration: 0.6, scrambleText: { text: pk.prod, chars: 'upperCase', speed: 0.8 } });
    status.textContent = pk.status; status.hidden = !pk.status; status.className = 'pm-status' + (pk.status === 'Live' ? ' is-live' : '');
    slotEls.forEach((el, k) => gsap.to(el, { duration: 0.7, delay: 0.06 * k, scrambleText: { text: pk.slots[k], chars: 'lowerCase', speed: 0.7 } }));
    if (byUser) { userTouched = true; if (auto) auto.kill(); }
  }
  tabs.forEach((t, k) => t.addEventListener('click', () => setPack(k, true), { signal: env.signal }));

  setStatic(0);
  if (env.reduced) return;

  // pulse travelling round the ring, lighting each stage as it passes
  const L = 2 * Math.PI * R;
  const trailEl = $('#coreTrail'), dot = $('#coreDot');
  trailEl.setAttribute('d', `M ${CX} ${CY - R} A ${R} ${R} 0 1 1 ${CX} ${CY + R} A ${R} ${R} 0 1 1 ${CX} ${CY - R}`);
  trailEl.style.strokeDasharray = `${L * 0.2} ${L}`;
  const o = { p: 0 };
  let hot = -1;
  gsap.to(o, {
    p: 1, duration: 9, ease: 'none', repeat: -1,
    onUpdate: () => {
      const a = -Math.PI / 2 + o.p * 2 * Math.PI;
      dot.setAttribute('cx', CX + R * Math.cos(a)); dot.setAttribute('cy', CY + R * Math.sin(a));
      trailEl.style.strokeDashoffset = String(L * 0.2 - o.p * L);
      const h = Math.round(o.p * 5) % 5;
      if (h !== hot) { nodes.forEach((n, k) => n.classList.toggle('hot', k === h)); hot = h; }
    },
  });
  const orbit = { a: 0 };
  gsap.to(orbit, { a: Math.PI * 2, duration: 60, ease: 'none', repeat: -1, onUpdate: () => {
    sats.forEach((s, k) => { const a = [0.4, 2.3, 4.2][k] + orbit.a * (k % 2 ? -1 : 1); s.setAttribute('cx', CX + 212 * Math.cos(a)); s.setAttribute('cy', CY + 212 * Math.sin(a)); });
  } });

  // dashes flow along the bus toward the pack
  gsap.to('.bus', { strokeDashoffset: -40, duration: 1.6, ease: 'none', repeat: -1 });

  // the pack swaps itself until a visitor picks one
  auto = gsap.delayedCall(4.6, function advance() {
    if (userTouched) return;
    setPack((cur + 1) % PACKS.length, false);
    auto.restart(true);
  });

  // pointer tilt
  const viz = $('#coreviz');
  if (matchMedia('(hover: hover) and (pointer: fine)').matches && viz) {
    const rx = gsap.quickTo(viz, 'rotationX', { duration: 0.6, ease: 'power3' }), ry = gsap.quickTo(viz, 'rotationY', { duration: 0.6, ease: 'power3' });
    gsap.set(viz, { transformPerspective: 1100 });
    viz.addEventListener('pointermove', (e) => { const r = viz.getBoundingClientRect(); ry(((e.clientX - r.left) / r.width - 0.5) * 7); rx(-((e.clientY - r.top) / r.height - 0.5) * 6); }, { signal: env.signal });
    viz.addEventListener('pointerleave', () => { rx(0); ry(0); }, { signal: env.signal });
  }
}

/* ------------------------------------------------------------------ contact form */
function initForm(env) {
  const form = $('#form');
  if (!form) return;
  form.noValidate = true;
  const status = $('#formStatus'), send = $('#send');
  const checks = [
    ['f-name', 'e-name', (v) => v.trim().length > 0],
    ['f-email', 'e-email', (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())],
    ['f-msg', 'e-msg', (v) => v.trim().length > 0],
  ];
  const setErr = (id, eid, bad) => {
    const input = document.getElementById(id), err = document.getElementById(eid);
    input.setAttribute('aria-invalid', String(bad));
    if (bad) input.setAttribute('aria-describedby', eid); else input.removeAttribute('aria-describedby');
    err.hidden = !bad;
  };
  checks.forEach(([id, eid, ok]) => document.getElementById(id).addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid') === 'true') setErr(id, eid, !ok(e.target.value));
  }, { signal: env.signal }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.className = 'status-msg'; status.textContent = '';
    let firstBad = null;
    checks.forEach(([id, eid, ok]) => {
      const bad = !ok(document.getElementById(id).value);
      setErr(id, eid, bad);
      if (bad && !firstBad) firstBad = document.getElementById(id);
    });
    if (firstBad) { firstBad.focus(); return; }
    const data = new FormData(form);
    if (data.get('_gotcha')) { status.className = 'status-msg is-ok'; status.textContent = 'Thanks. We have your request.'; form.reset(); return; }
    send.disabled = true; send.textContent = 'Sending';
    try {
      const res = await fetch(form.action, { method: form.method, headers: { Accept: 'application/json' }, body: data });
      if (!res.ok) throw new Error(String(res.status));
      status.className = 'status-msg is-ok'; status.textContent = 'Thanks. We have your request and will reply by email.'; form.reset();
    } catch {
      status.className = 'status-msg is-err'; status.textContent = 'That did not send. Check your connection and try again.';
    } finally { send.disabled = false; send.textContent = 'Send request'; }
  }, { signal: env.signal });
}

/* ------------------------------------------------------------------ question band: cycles one question at a time */
function initQuestions(env) {
  const items = $$('#qlist li');
  if (items.length < 2 || env.reduced) return;
  const now = $('#qNow');
  let i = 0;
  const call = gsap.delayedCall(3.4, function tick() {
    const prev = items[i];
    i = (i + 1) % items.length;
    prev.classList.remove('is-on'); prev.classList.add('is-out');
    items[i].classList.remove('is-out'); items[i].classList.add('is-on');
    setTimeout(() => prev.classList.remove('is-out'), 900);
    if (now) now.textContent = String(i + 1);
    call.restart(true);
  });
}

/* ------------------------------------------------------------------ loop stages: click one to scroll to its full state */
function initLoopSteps(env) {
  $$('.step-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const geo = window.__geo && window.__geo.loop;
      if (!geo) return;
      const k = parseInt(btn.dataset.go, 10);
      // stage k is fully formed at progress k/5; nudge past the boundary so the step label is unambiguous
      const lp = k >= 5 ? 1 : (k + 0.02) / 5;
      const y = Math.round(geo.top + lp * (geo.h - innerHeight));
      if (env.lenis && env.lenis()) env.lenis().scrollTo(y, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
      else window.scrollTo({ top: y, behavior: 'auto' });
    }, { signal: env.signal });
  });
}

/* ------------------------------------------------------------------ one call per page load */
export function initPageContent(env) {
  initHeadings(env);
  initQuestions(env);
  initLoopSteps(env);
  initLedger(env);
  initKronig(env);
  initInverse(env);
  initWhyNow(env);
  initMaterials(env);
  initExploreHover(env);
  initCore(env);
  initForm(env);
}
