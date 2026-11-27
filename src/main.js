import { mountParticleSignature } from './scene/particle-signature.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { detectTier } from './scene/tier.js';
import { createDirector } from './director.js';
import { initCursor, createReactiveType, initMarquee, createWipe, buildRail } from './fx.js';
import { initPageContent, createPageTicker } from './pages.js';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
root.classList.add('js');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
document.body.dataset.page = $('#main').dataset.page;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

const reduced = root.classList.contains('reduced');   // only ?motion=reduce; the OS setting is deliberately ignored
// ?safe turns off the wipe, smooth-scroll, custom cursor and overlays.
const safe = /[?&]safe\b/.test(location.search);
if (safe) root.classList.add('safe');
const canvas = $('#gl');
let tierInfo = null;
history.scrollRestoration = 'manual';

let field = null, lenis = null, wipe = null, ctx = null, abort = null, rail = { setActive() {} };
let pageTick = () => {}, marqueeTick = () => {};
let busy = false, menuOpen = false, clock = 0, scrollVel = 0;
let heroEntry = null;
let currentPath = location.pathname;
const pointerN = { x: 0.5, y: 0.5 };
const director = createDirector({});
const reactive = createReactiveType();

/* ------------------------------------------------------------------ shared environment for page modules */
const env = {
  reduced, reactive, signal: null,
  morph: (i) => morph(i),
  lenis: () => lenis,
};

function finishHeroEntry() {
  heroEntry?.kill();
  heroEntry = null;
  director.setStartup(1);
  root.classList.remove('hero-entry', 'hero-entry-reveal');
}

/* ------------------------------------------------------------------ WebGL, fetched after first paint */
async function initField(onProgress) {
  // Let the document paint before probing and compiling an optional renderer.
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  tierInfo = detectTier();
  window.__tier = tierInfo;
  if (onProgress) await onProgress(25);
  if (!tierInfo) { canvas.style.display = 'none'; return null; }
  try {
    const wantsHeroMotion = Boolean($('.hero-signature')) && !reduced && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const [{ Field }, heroMotion] = await Promise.all([
      import('./scene/field.js'),
      wantsHeroMotion && import('./scene/wordmark.js')
        .then(({ loadHeroWordmarkFont }) => loadHeroWordmarkFont())
        .catch(() => false),
    ]);
    if (onProgress) await onProgress(60);
    const count = Math.round(tierInfo.count * (heroMotion ? (tierInfo.software ? 1.2 : 1.35) : 1));
    const readyField = await new Field(canvas, { ...tierInfo, count, wordmark: heroMotion }).init();
    if (onProgress) await onProgress(90);
    field = readyField;
    if (heroMotion && root.classList.contains('startup-loading') && window.scrollY < 2) {
      director.setStartup(0);
      root.classList.add('hero-entry');
    }
    field.state.intro = 1;
    if (heroMotion) {
      root.classList.add('has-hero-particles');
      director.rebuild();
    }
    director.update(window.scrollY, 1, clock, field, pointerN);
    field.renderOnce();
    root.classList.add('has-webgl-field');
    const disableHeroParticles = () => {
      finishHeroEntry();
      root.classList.remove('has-webgl-field', 'has-hero-particles');
    };
    field.onDegrade = (what) => { if (what === 'off') { canvas.style.display = 'none'; field.disabled = true; disableHeroParticles(); } };
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); field.lost = true; disableHeroParticles(); });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    window.__field = field;
    const selectedMaterial = $('.mat[aria-pressed="true"]');
    if (selectedMaterial) morph(Number(selectedMaterial.dataset.mat));
    return field;
  } catch (err) {
    finishHeroEntry();
    root.classList.remove('has-hero-particles');
    console.warn('WebGL setup failed, continuing without the field.', err);
    canvas.style.display = 'none';
    field = null;
    return null;
  }
}

/** morph the crystal between GaN / AlGaN / SiC / HfO2 */
let shown = 0, morphTween = null;
function morph(i) {
  if (!field) return;
  const s = field.state;
  if (morphTween && s.matB === i) return;
  if (morphTween) {
    morphTween.kill();
    morphTween = null;
    shown = s.matMix > 0.5 ? s.matB : s.matA;
  }
  if (i === shown) { s.matA = i; s.matB = i; s.matMix = 0; return; }
  s.matA = shown; s.matB = i; s.matMix = 0;
  if (reduced) { s.matA = i; s.matB = i; shown = i; field.renderOnce(); return; }
  morphTween = gsap.to(s, {
    matMix: 1, duration: 1.3, ease: 'power3.inOut',
    onComplete: () => { s.matA = i; s.matB = i; s.matMix = 0; shown = i; morphTween = null; },
  });
}

/* ------------------------------------------------------------------ the frame loop */
function tick(time, deltaMs) {
  if (document.hidden) return;
  const elapsed = Math.min(deltaMs / 1000, .25) || .016;
  const dt = Math.min(elapsed, .05);
  clock += dt;
  if (lenis) lenis.raf(time * 1000);
  const y = window.scrollY;
  const { T, D } = director.update(y, dt, clock, field, pointerN);
  if (director.startup === 1 && root.classList.contains('hero-entry') && !root.classList.contains('hero-entry-reveal')) finishHeroEntry();
  scrollVel = D.vel;
  pageTick(T);
  rail.setActive(y, director.geo);
  marqueeTick(dt);
  if (field && !field.disabled) {
    const opacity = D.op.toFixed(3);
    if (canvas.style.opacity !== opacity) canvas.style.opacity = opacity;
    field.paused = D.op < 0.03;
    if (!field.paused) field.update(clock, elapsed);
  }
}

/* ------------------------------------------------------------------ page lifecycle */
function setActiveNav() {
  const here = location.pathname.replace(/\/$/, '');
  $$('.nav-links a, #menu a, .foot nav a').forEach((a) => {
    const p = new URL(a.href).pathname.replace(/\/$/, '');
    const inProducts = a.classList.contains('menu-trigger') && ['/products', '/nexcon', '/kronig'].includes(here);
    if (p === here || inProducts) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

function initPage() {
  if (ctx) ctx.revert();
  if (abort) abort.abort();
  reactive.clear();
  abort = new AbortController();
  env.signal = abort.signal;
  ctx = gsap.context(() => initPageContent(env));
  director.rebuild();
  const sceneLayout = new ResizeObserver(() => director.rebuild());
  sceneLayout.observe($('#main'));
  abort.signal.addEventListener('abort', () => sceneLayout.disconnect(), { once: true });
  window.__geo = director.geo;
  pageTick = createPageTicker();
  rail = buildRail((el) => {
    // a section can ask to be entered part-way (data-land = fraction of its scroll range), so the dot lands on the finished state, not on an empty first frame
    const f = parseFloat(el.dataset.land);
    let target = el;
    if (!Number.isNaN(f)) {
      const top = el.getBoundingClientRect().top + window.scrollY;
      target = Math.round(top + f * Math.max(0, el.offsetHeight - innerHeight));
    }
    if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else if (typeof target === 'number') window.scrollTo(0, target); else el.scrollIntoView();
  }, abort.signal);
  marqueeTick = reduced ? () => {} : initMarquee(() => scrollVel);
  setActiveNav();
  ScrollTrigger.refresh();
  director.rebuild();
  if (field && reduced) staticRender();
}

function staticRender() {
  const s = field.state;
  Object.assign(s, { a: 5, b: 5, m: 0, intro: 1, scale: 1, offsetX: innerWidth <= 820 ? 0 : 3, offsetY: innerWidth <= 820 ? 2.3 : 0, rot: 0.9, ripple: 0, dust: 1 });
  field.frozen = true;
  canvas.style.opacity = '0.4';
  field.renderOnce();
}

/* ------------------------------------------------------------------ router: scanline wipe between real pages */
const PAGES = new Set(['/', '/index.html', '/technology', '/technology.html', '/products', '/products.html', '/nexcon', '/nexcon.html', '/kronig', '/kronig.html', '/about', '/about.html', '/contact', '/contact.html', '/privacy', '/privacy.html']);
const cache = new Map();
const load = (path) => {
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); }));
  return cache.get(path);
};

async function go(href, push = true) {
  if (busy) return;
  const u = new URL(href, location.href);
  if (u.pathname === currentPath && !u.hash) { lenis && lenis.scrollTo(0, { duration: 1.2 }); return; }
  busy = true;
  finishHeroEntry();
  try {
    const html = load(u.pathname);
    await Promise.all([wipe.cover(), html]);
    const doc = new DOMParser().parseFromString(await html, 'text/html');
    const next = doc.querySelector('#main');
    if (!next) throw new Error('no main');
    closeMenu(true);
    $('#main').replaceWith(next);
    document.title = doc.title;
    const desc = doc.querySelector('meta[name="description"]');
    if (desc) $('meta[name="description"]')?.setAttribute('content', desc.content);
    document.body.dataset.page = next.dataset.page;
    if (push) history.pushState({}, '', u.pathname + u.hash);
    currentPath = u.pathname;
    window.scrollTo(0, 0);
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    director.D.rp = 0;
    initPage();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await wipe.reveal();
  } catch (err) {
    console.warn('navigation fell back to a full load', err);
    location.href = u.href;
    return;
  } finally {
    busy = false;
  }
}

/** back/forward can arrive mid-transition; remember the latest target and honour it when free */
let busyQueue = null;
function flushQueue() {
  if (busy) { setTimeout(flushQueue, 120); return; }
  if (!busyQueue) return;
  const target = busyQueue; busyQueue = null;
  go(target, false);
}

function initLinks() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return;
    // same-page anchors scroll smoothly
    if (u.pathname === currentPath && u.hash) {
      const el = $(u.hash);
      if (el) { e.preventDefault(); lenis ? lenis.scrollTo(el, { duration: 1.8, easing: (t) => 1 - Math.pow(1 - t, 4) }) : el.scrollIntoView(); history.replaceState(null, '', u.hash); }
      return;
    }
    if (!PAGES.has(u.pathname)) return;
    e.preventDefault();
    go(u.href);
  });
  addEventListener('popstate', () => { busyQueue = location.href; flushQueue(); });
  // warm the cache when intent is clear
  document.addEventListener('pointerover', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const u = new URL(a.href, location.href);
    if (u.origin === location.origin && PAGES.has(u.pathname) && u.pathname !== currentPath) load(u.pathname).catch(() => {});
  }, { passive: true });
}

/* ------------------------------------------------------------------ menu + nav */
function closeMenu(instant) {
  const btn = $('#menuBtn'), menu = $('#menu');
  if (!menuOpen) return;
  menuOpen = false;
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Open menu');
  menu.classList.remove('is-open');
  menu.inert = true;
  lenis && lenis.start();
  if (instant) menu.hidden = true; else setTimeout(() => { if (!menuOpen) menu.hidden = true; }, 600);
}
function initMenu() {
  const btn = $('#menuBtn'), menu = $('#menu');
  const links = $$('a', menu);
  matchMedia('(max-width: 1024px)').addEventListener('change', (event) => {
    if (!event.matches) closeMenu(true);
  });
  btn.addEventListener('click', () => {
    if (menuOpen) return closeMenu();
    menuOpen = true; menu.hidden = false; menu.inert = false;
    requestAnimationFrame(() => { if (menuOpen) menu.classList.add('is-open'); });
    btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-label', 'Close menu');
    lenis && lenis.stop();
    const current = $('[aria-current="page"]', menu);
    const group = current?.closest('details');
    if (group) group.open = true;
    (current ?? links[0]).focus({ preventScroll: true });
  });
  document.addEventListener('keydown', (e) => {
    if (!menuOpen) return;
    const items = $$('a, summary', menu).filter((item) => item.getClientRects().length);
    const index = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      closeMenu();
      btn.focus({ preventScroll: true });
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = index < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1)
        : (index + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      items[next].focus();
    } else if (e.key === 'Tab') {
      const focusOrder = [btn, ...items];
      const next = (focusOrder.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1) + focusOrder.length) % focusOrder.length;
      e.preventDefault();
      focusOrder[next].focus();
    }
  });
  links.forEach((a) => a.addEventListener('click', () => closeMenu()));
}
function initNavHide() {
  const nav = $('#nav');
  let last = 0;
  addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y < 120) nav.classList.remove('is-hidden');
    else if (y > last + 4 && !menuOpen) nav.classList.add('is-hidden');
    else if (y < last - 4) nav.classList.remove('is-hidden');
    last = y;
  }, { passive: true });
}

/* ------------------------------------------------------------------ ?debug badge: what this browser is actually doing */
function initDebug() {
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;margin:0;padding:8px 10px;background:rgba(0,0,0,.82);color:#9fe;font:11px/1.4 ui-monospace,Consolas,monospace;max-width:92vw;white-space:pre-wrap;pointer-events:none;border:1px solid #2f6bf0';
  document.body.appendChild(el);
  setInterval(() => {
    const s = field && field.state;
    el.textContent = [
      `tier: ${tierInfo ? tierInfo.name + (tierInfo.software ? ' (software renderer)' : '') : 'OFF (no WebGL)'}`,
      `gpu: ${tierInfo ? tierInfo.renderer : 'n/a'}`,
      `reduced-motion: ${reduced}  save-data: ${!!(navigator.connection && navigator.connection.saveData)}`,
      `field: ${field ? (field.disabled ? 'disabled by governor' : 'running') : 'none'}  dpr ${field ? field.dpr : '-'}  points ${field ? field.drawCount : '-'}  frame ${field ? Math.round(field.ema) + 'ms' : '-'}`,
      `state: ${s ? `${s.a}>${s.b} @${s.m.toFixed(2)} scale ${s.scale.toFixed(2)}` : '-'}  page: ${currentPath}`,
    ].join('\n');
  }, 500);
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  const signature = document.querySelector('.foot-signature');
  if (signature && !reduced && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const prewarm = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      prewarm.disconnect();
      mountParticleSignature(signature);
    }, { rootMargin: '800px' });
    prewarm.observe(signature);
  }
  if (/[?&]debug\b/.test(location.search)) initDebug();
  wipe = createWipe(() => field);

  const siteGrid = $('#siteGrid');
  const hideGridLight = () => siteGrid?.classList.remove('is-lit');
  addEventListener('pointermove', (e) => {
    pointerN.x = e.clientX / innerWidth; pointerN.y = e.clientY / innerHeight;
    if (e.pointerType === 'touch') { hideGridLight(); return; }
    if (field) field.pointer(e.clientX, e.clientY);
    if (siteGrid) {
      siteGrid.style.setProperty('--light-x', `${e.clientX}px`);
      siteGrid.style.setProperty('--light-y', `${e.clientY}px`);
      siteGrid.classList.add('is-lit');
    }
  }, { passive: true });
  document.addEventListener('pointerleave', () => {
    hideGridLight();
    field?.pointer(null);
  });
  addEventListener('blur', hideGridLight);
  let rz;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { director.rebuild(); field && field.resize(); ScrollTrigger.refresh(); if (reduced && field) { staticRender(); } }, 150); });
  ScrollTrigger.addEventListener('refresh', () => director.rebuild());
  initMenu();

  if (reduced) {
    $('#wipe').style.display = 'none';
    initPage();
    root.classList.add('ready');
    await initField();
    if (field) staticRender();
    return;
  }

  if (safe) {
    $('#wipe').style.display = 'none';
    gsap.ticker.lagSmoothing(0);
    gsap.ticker.add(tick);
    initNavHide();
    initPage();
    root.classList.add('ready');
    await initField();
    return;
  }

  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.95, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.lagSmoothing(0);
  gsap.ticker.add(tick);
  initCursor();
  initNavHide();
  initLinks();

  const startup = root.classList.contains('startup-loading');
  const count = startup ? $('#wipeCount') : null;
  let progress = 0;
  function advance(value) {
    if (!count || !root.classList.contains('startup-loading')) return;
    return new Promise(resolve => {
      let previousTime;
      const update = time => {
        if (!root.classList.contains('startup-loading') || progress >= value) {
          resolve();
          return;
        }
        const elapsed = Math.min(time - (previousTime ?? time - 16), 20);
        previousTime = time;
        progress = Math.min(value, progress + elapsed * .16);
        count.textContent = String(Math.floor(progress));
        // Leave the milestone on screen for a paint before WebGL work resumes.
        requestAnimationFrame(update);
      };
      requestAnimationFrame(update);
    });
  }
  initPage();
  root.classList.add('ready');
  const f = await initField(startup ? advance : undefined);
  if (root.classList.contains('startup-loading')) {
    await advance(100);
    if (root.classList.contains('startup-loading')) await wipe.reveal(.48);
    root.classList.remove('startup-loading');
  }
  if (f?.hasWordmark && director.startup < 1) {
    const opening = { progress: 0 };
    heroEntry = gsap.to(opening, {
      progress: 1, delay: .42, duration: 1.55, ease: 'power2.inOut',
      onUpdate: () => {
        if (director.startup === 1) { finishHeroEntry(); return; }
        director.setStartup(opening.progress);
        if (opening.progress >= .63) root.classList.add('hero-entry-reveal');
      },
      onComplete: finishHeroEntry,
    });
  }
}

boot();
