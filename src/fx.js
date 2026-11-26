import gsap from 'gsap';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/* ------------------------------------------------------------------ cursor: dot + lagging ring, magnetic buttons */
export function initCursor() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const root = document.documentElement;
  const el = $('#cursor');
  if (!el) return;
  root.classList.add('has-cursor');
  const dot = $('.cursor-dot', el), ring = $('.cursor-ring', el);
  const p = { x: -100, y: -100, rx: -100, ry: -100 };
  let seen = false;

  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    p.x = e.clientX; p.y = e.clientY;
    if (!seen) { seen = true; p.rx = p.x; p.ry = p.y; el.classList.add('is-on'); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => el.classList.remove('is-on'));
  document.addEventListener('pointerenter', () => seen && el.classList.add('is-on'));
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('a, button, [role="button"], .mat, summary');
    const txt = e.target.closest('input, textarea');
    el.classList.toggle('is-link', !!t && !txt);
    el.classList.toggle('is-text', !!txt);
  });
  document.addEventListener('pointerdown', () => el.classList.add('is-down'));
  document.addEventListener('pointerup', () => el.classList.remove('is-down'));

  gsap.ticker.add(() => {
    p.rx += (p.x - p.rx) * 0.16;
    p.ry += (p.y - p.ry) * 0.16;
    dot.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    ring.style.transform = `translate3d(${p.rx}px, ${p.ry}px, 0)`;
  });

  // magnetic buttons: the button leans toward the pointer
  document.addEventListener('pointermove', (e) => {
    const b = e.target.closest && e.target.closest('.btn');
    $$('.btn.is-mag').forEach((x) => { if (x !== b) { x.classList.remove('is-mag'); x.style.transform = ''; } });
    if (!b) return;
    const r = b.getBoundingClientRect();
    b.classList.add('is-mag');
    b.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * 0.22}px, ${(e.clientY - (r.top + r.height / 2)) * 0.32}px)`;
  }, { passive: true });
}

/* ------------------------------------------------------------------ reactive type: letters swell and narrow around the pointer */
export function createReactiveType() {
  let groups = [];
  let rects = [];
  let raf = 0, lastRects = 0, pointer = null;

  function measure() {
    rects = [];
    groups.forEach((chars) => chars.forEach((c) => { const r = c.getBoundingClientRect(); rects.push({ c, x: r.left + r.width / 2, y: r.top + r.height / 2 }); }));
    lastRects = performance.now();
  }
  function frame() {
    raf = 0;
    if (!pointer) return;
    if (performance.now() - lastRects > 400) measure();
    for (const r of rects) {
      if (r.y < -200 || r.y > innerHeight + 200) continue;
      const d = Math.hypot(pointer.x - r.x, pointer.y - r.y);
      const f = clamp(1 - d / 190);
      r.c.style.fontVariationSettings = f > 0.01 ? `'wght' ${Math.round(600 + 200 * f)}, 'wdth' ${Math.round(100 - 22 * f)}` : '';
    }
  }
  const onMove = (e) => { pointer = { x: e.clientX, y: e.clientY }; if (!raf) raf = requestAnimationFrame(frame); };
  const onLeave = () => { pointer = null; rects.forEach((r) => (r.c.style.fontVariationSettings = '')); };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('scroll', () => { lastRects = 0; }, { passive: true });
  document.addEventListener('pointerleave', onLeave);

  return {
    set(list) { groups = list; measure(); },
    add(chars) { groups.push(chars); measure(); },
    clear() { groups = []; rects = []; },
  };
}

/* ------------------------------------------------------------------ marquee: drifts, speeds up and skews with scroll velocity */
export function initMarquee(getVelocity) {
  const mq = $('#marquee');
  if (!mq) return () => {};
  const track = $('.marquee-track', mq);
  const base = track.innerHTML;
  track.innerHTML = base + base + base + base;
  let x = 0, w = 0;
  const measure = () => { w = track.scrollWidth / 4; };
  measure();
  addEventListener('resize', measure);
  const skew = gsap.quickTo(track, 'skewX', { duration: 0.4, ease: 'power3' });
  return (dt) => {
    const v = getVelocity();
    x -= (60 + Math.abs(v) * 900) * dt * (v < -0.02 ? -1 : 1);
    if (x <= -w) x += w;
    if (x > 0) x -= w;
    track.style.transform = `translate3d(${x}px,0,0)`;
    skew(clamp(v * -14, -9, 9));
  };
}

/* ------------------------------------------------------------------ the scanline wipe between pages */
export function createWipe(getField) {
  const wipe = $('#wipe'), line = $('#wipeLine');
  const s = { top: 0, bottom: 0 };
  const apply = (edge) => {
    wipe.style.clipPath = `inset(${s.top}% 0 ${s.bottom}% 0)`;
    line.style.transform = `translate3d(0, ${edge}vh, 0)`;
    line.style.opacity = edge <= 0.2 || edge >= 99.8 ? '0' : '1';
  };
  apply(100);

  const burst = (peak) => {
    const field = getField();
    if (!field) return;
    gsap.fromTo(field.state, { burst: 0 }, { burst: peak, duration: 0.55, ease: 'power2.out', yoyo: true, repeat: 1 });
  };

  return {
    /** curtain falls from the top, edge line leading */
    cover() {
      s.top = 0; s.bottom = 100; wipe.classList.add('is-nav'); wipe.style.display = 'grid';
      burst(0.9);
      return new Promise((res) => gsap.to(s, { bottom: 0, duration: 0.7, ease: 'power3.inOut', onUpdate: () => apply(100 - s.bottom), onComplete: res }));
    },
    /** curtain lifts downward and away */
    reveal(duration = 0.85) {
      s.top = 0; s.bottom = 0;
      return new Promise((res) => gsap.to(s, { top: 100, duration, ease: 'power3.inOut', onUpdate: () => apply(s.top), onComplete: () => { wipe.classList.remove('is-nav'); wipe.style.display = 'none'; res(); } }));
    },
  };
}

/* ------------------------------------------------------------------ section rail, built from [data-rail] */
export function buildRail(onGo, signal) {
  const rail = $('#rail');
  if (!rail) return { setActive() {} };
  const secs = $$('main [data-rail]');
  rail.hidden = secs.length < 2;
  rail.classList.remove('is-open');
  rail.replaceChildren();
  if (rail.hidden) return { setActive() {} };
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rail-toggle';
  button.setAttribute('aria-label', 'Toggle section selector');
  button.setAttribute('aria-controls', 'rail-sectors');
  button.setAttribute('aria-expanded', 'false');
  const sectors = document.createElement('div');
  sectors.id = 'rail-sectors';
  sectors.className = 'rail-sectors';
  sectors.inert = true;
  rail.append(button, sectors);

  const slice = 2 * Math.PI / secs.length;
  const point = (angle, radius) => [64 + Math.sin(angle) * radius, 64 - Math.cos(angle) * radius];
  const links = secs.map((section, i) => {
    const angle = i * slice;
    const start = angle - slice / 2 + .025, end = angle + slice / 2 - .025;
    const shape = `M ${point(start, 58)} A 58 58 0 0 1 ${point(end, 58)} L ${point(end, 25)} A 25 25 0 0 0 ${point(start, 25)} Z`;
    const [x, y] = point(angle, 42);
    const link = document.createElement('a');
    link.href = `#${section.id}`;
    link.innerHTML = `<svg viewBox="0 0 128 128" aria-hidden="true"><path d="${shape}"/><circle cx="${x}" cy="${y}" r="3"/></svg>`;
    const label = document.createElement('span');
    label.textContent = section.dataset.rail;
    link.append(label);
    sectors.append(link);
    link.addEventListener('click', e => {
      e.preventDefault();
      setOpen(false);
      button.focus({ preventScroll: true });
      onGo(section);
    });
    return link;
  });
  function setOpen(open) {
    rail.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    sectors.inert = !open;
  }
  button.addEventListener('click', () => setOpen(!rail.classList.contains('is-open')));
  rail.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !rail.classList.contains('is-open')) return;
    e.preventDefault();
    setOpen(false);
    button.focus({ preventScroll: true });
  }, { signal });
  document.addEventListener('pointerdown', e => {
    if (!rail.contains(e.target)) setOpen(false);
  }, { signal });
  let cur = -1;
  return {
    setActive(y, geo) {
      const yc = y + innerHeight * 0.5;
      let a = 0;
      secs.forEach((s, i) => { const g = geo.sections && geo.sections[s.id]; if (g && yc >= g.top) a = i; });
      if (a === cur) return;
      cur = a;
      links.forEach((l, i) => { l.classList.toggle('is-on', i === a); if (i === a) l.setAttribute('aria-current', 'location'); else l.removeAttribute('aria-current'); });
    },
  };
}
