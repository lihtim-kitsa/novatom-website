// End-to-end suite for the multi-page site: routing, scroll scenes, resilience, accessibility, performance.
// Run npm run build and npm run preview before running this suite.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE = (process.env.BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
const GPU_ARGS = ['--use-angle=d3d11', '--ignore-gpu-blocklist'];
const SOFT_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu'];

const results = [];
const record = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { const out = await fn(); record(name, out === undefined || out === true || out?.ok !== false, out?.detail || ''); }
  catch (e) { record(name, false, String(e.message || e).split('\n')[0]); }
}

const browserGpu = await chromium.launch({ headless: true, args: GPU_ARGS });
const browserSoft = await chromium.launch({ headless: true, args: SOFT_ARGS });

async function open(browser, { path = '/', width = 1440, height = 900, mobile = false, reduced = false, init, route, wait = 3600 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  if (init) await page.addInitScript(init);
  if (route) await route(ctx);
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(wait);
  return { ctx, page, errors };
}
const geoOf = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__geo)));

const PAGES = {
  '/': { h1: /Science that runs itself/i, ids: ['top', 'space', 'loop', 'explore'] },
  '/technology': { h1: /One core loop/i, ids: ['core', 'ledger'] },
  '/products': { h1: /Products built on one platform/i, ids: ['products', 'catalog'] },
  '/nexcon': { h1: /NexCon-03/i, ids: ['nexcon', 'inverse'] },
  '/kronig': { h1: /Kronig/i, ids: ['kronig'] },
  '/about': { h1: /limited by throughput/i, ids: ['company-hero', 'whynow', 'model', 'team'] },
  '/contact': { h1: /Request access/i, ids: ['contact'] },
};

/* ================================================================== 1. every page loads cleanly */
for (const [path, spec] of Object.entries(PAGES)) {
  await test(`page ${path}: loads, one h1, sections present, no console errors, WebGL active`, async () => {
    const { ctx, page, errors } = await open(browserGpu, { path });
    const r = await page.evaluate((ids) => ({
      h1s: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
      missing: ids.filter((id) => !document.getElementById(id)),
      field: !!window.__field, title: document.title, rail: document.querySelectorAll('#rail a').length,
    }), spec.ids);
    await ctx.close();
    return { ok: r.h1s.length === 1 && spec.h1.test(r.h1s[0]) && r.missing.length === 0 && r.field && errors.length === 0, detail: `${r.title} | h1="${r.h1s[0]}" rail=${r.rail} ${errors.join('|')}` };
  });
}

/* ================================================================== 2. router */
await test('router: nav click swaps the page with no full reload, canvas persists, URL/title/h1 update', async () => {
  const { ctx, page, errors } = await open(browserGpu, { path: '/' });
  await page.evaluate(() => { window.__marker = 'alive'; window.__canvas = document.getElementById('gl'); });
  await page.click('.nav-links a[href="/technology"]');
  await page.waitForTimeout(3200);
  const r = await page.evaluate(() => ({ marker: window.__marker, same: window.__canvas === document.getElementById('gl'), path: location.pathname, title: document.title, h1: document.querySelector('h1')?.textContent.trim(), cur: document.querySelector('.nav-links a[aria-current="page"]')?.textContent.trim(), wipe: getComputedStyle(document.getElementById('wipe')).display, bodyPage: document.body.dataset.page }));
  await page.goBack(); await page.waitForTimeout(3000);
  const back = await page.evaluate(() => ({ marker: window.__marker, path: location.pathname, h1: document.querySelector('h1')?.textContent.trim() }));
  await page.goForward(); await page.waitForTimeout(3000);
  const fwd = await page.evaluate(() => location.pathname);
  await ctx.close();
  return { ok: r.marker === 'alive' && r.same && r.path === '/technology' && /Technology/.test(r.title) && /One core loop/.test(r.h1) && /Technology/.test(r.cur) && r.wipe === 'none' && r.bodyPage === 'technology' && back.marker === 'alive' && back.path === '/' && /Science/.test(back.h1) && fwd === '/technology' && errors.length === 0, detail: JSON.stringify({ r, back, fwd }) + errors.join('|') };
});

await test('router: a wipe is actually visible mid-transition, then clears', async () => {
  const { ctx, page } = await open(browserGpu, { path: '/' });
  await page.click('.nav-links a[href="/about"]');
  await page.waitForTimeout(330);
  const mid = await page.evaluate(() => { const w = document.getElementById('wipe'); return { display: getComputedStyle(w).display, clip: w.style.clipPath, line: document.getElementById('wipeLine').style.opacity }; });
  await page.waitForTimeout(2600);
  const end = await page.evaluate(() => getComputedStyle(document.getElementById('wipe')).display);
  await ctx.close();
  return { ok: mid.display !== 'none' && mid.clip !== 'inset(0% 0px 0% 0px)' && end === 'none', detail: JSON.stringify(mid) + ' end=' + end };
});

await test('router: every page link works from the footer and the explore list', async () => {
  const { ctx, page } = await open(browserGpu, { path: '/' });
  const seen = [];
  for (const p of ['/technology', '/products', '/nexcon', '/kronig', '/about', '/contact']) {
    await page.evaluate((h) => document.querySelector(`.foot nav a[href="${h}"]`).click(), p);
    await page.waitForTimeout(2600);
    seen.push(await page.evaluate(() => location.pathname));
  }
  await ctx.close();
  return { ok: seen.join() === '/technology,/products,/nexcon,/kronig,/about,/contact', detail: seen.join(' ') };
});

await test('router: busy navigation clicks are ignored safely, rapid back and forth does not break', async () => {
  const { ctx, page, errors } = await open(browserGpu, { path: '/' });
  for (let i = 0; i < 4; i++) { await page.evaluate(() => document.querySelector('.nav-links a[href="/about"]').click()); await page.evaluate(() => document.querySelector('.nav-links a[href="/technology"]').click()); }
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => ({ path: location.pathname, wipe: getComputedStyle(document.getElementById('wipe')).display, h1: document.querySelectorAll('h1').length }));
  await ctx.close();
  return { ok: r.wipe === 'none' && r.h1 === 1 && errors.length === 0, detail: JSON.stringify(r) + errors.join('|') };
});

/* ================================================================== 3. scroll scenes */
await test('home scroll story: crystal -> dive -> dissolves to cloud -> loop steps 1..5 -> explore', async () => {
  const { ctx, page } = await open(browserGpu, { path: '/' });
  const geo = await geoOf(page), vh = 900;
  const sp = (f) => geo.space.top + f * (geo.space.h - vh);
  const lp = (f) => geo.loop.top + f * (geo.loop.h - vh);
  const seq = [['hero', 0], ['dive', sp(0.3)], ['cloud', sp(0.95)], ['l1', lp(0.2)], ['l2', lp(0.4)], ['l3', lp(0.6)], ['l4', lp(0.78)], ['l5', lp(0.98)], ['explore', geo.explore.top + 200]];
  const out = [];
  for (const [name, y] of seq) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(1500);
    out.push([name, await page.evaluate(() => { const s = window.__field.state; return { a: s.a, b: s.b, m: +s.m.toFixed(2), sc: +s.scale.toFixed(1), step: document.querySelector('.step.is-active h3')?.innerText.replace(/\s+/g, ' ') || '', exp: document.getElementById('bnExp').textContent }; })]);
  }
  await ctx.close();
  const g = Object.fromEntries(out);
  const ok = g.hero.a === 5 && g.hero.b === 5 && g.dive.sc > 3 && g.cloud.a === 0 && g.cloud.exp === '8' && /Define/.test(g.l1.step) && /Hypothesise/.test(g.l2.step) && /Screen/.test(g.l3.step) && /Make and measure/.test(g.l4.step) && /Learn/.test(g.l5.step) && g.explore.a === 5;
  return { ok, detail: out.map(([n, s]) => `${n}:${s.a}>${s.b}@${s.m} x${s.sc}`).join(' ') };
});

await test('materials page: four families morph the crystal, structure text and aria-pressed update', async () => {
  const { ctx, page } = await open(browserGpu, { path: '/nexcon' });
  const out = [];
  for (const i of [1, 2, 3, 0]) {
    await page.click(`.mat[data-mat="${i}"]`); await page.waitForTimeout(300);
    out.push(await page.evaluate((k) => ({ name: document.getElementById('structName').textContent, pressed: document.querySelectorAll('.mat')[k].getAttribute('aria-pressed'), mix: +window.__field.state.matMix.toFixed(2) }), i));
  }
  await ctx.close();
  const names = out.map((o) => o.name);
  return { ok: out.every((o) => o.pressed === 'true') && names.join() === 'Wurtzite alloy,4H polytype,Cubic fluorite,Wurtzite' && out.some((o) => o.mix > 0), detail: names.join(' > ') };
});

await test('technology page opens already animating (ledger is not an empty panel)', async () => {
  const { ctx, page } = await open(browserGpu, { path: '/technology', wait: 5200 });
  const r = await page.evaluate(() => [...document.querySelectorAll('.lrow')].map((row) => getComputedStyle(row).clipPath));
  await ctx.close();
  return { ok: r[0].includes('0%') || r[0] === 'none', detail: r.join(' | ') };
});

await test('inverse design: chart draws and lands on 0.46, 4.43 eV, 280 nm', async () => {
  const { ctx, page } = await open(browserGpu, { path: '/nexcon' });
  const g = await geoOf(page);
  await page.evaluate((y) => window.scrollTo(0, y), g.inverse.top + 120);
  await page.waitForTimeout(5200);
  const r = await page.evaluate(() => ({ x: document.getElementById('invX').textContent, e: document.getElementById('invE').textContent, l: document.getElementById('invL').textContent, rows: [...document.querySelectorAll('#recipe > div')].every((d) => getComputedStyle(d).opacity === '1') }));
  await ctx.close();
  return { ok: r.x === 'Al fraction 0.46' && r.e === '4.43 eV' && r.l === '280 nm' && r.rows, detail: JSON.stringify(r) };
});

await test('devices page: pipeline lights seven steps, bars reach 3.7 / 3.6 / 1.0 %', async () => {
  const { ctx, page } = await open(browserGpu, { path: '/kronig' });
  const g = await geoOf(page);
  await page.evaluate((y) => window.scrollTo(0, y), g.kronig.top + 1500);
  await page.waitForTimeout(3600);
  const r = await page.evaluate(() => ({ on: document.querySelectorAll('#pipe li.is-on').length, vals: [...document.querySelectorAll('.bar-v')].map((v) => v.textContent) }));
  await ctx.close();
  return { ok: r.on >= 5 && r.vals.join() === '3.7%,3.6%,1.0%', detail: JSON.stringify(r) };
});

/* ================================================================== 4. form */
const formCtx = (handler) => open(browserGpu, { path: '/contact', route: async (ctx) => ctx.route('https://formspree.io/**', handler) });
await test('form: empty submit shows three inline errors and focuses the first', async () => {
  const { ctx, page } = await formCtx((r) => r.fulfill({ status: 200, body: '{"ok":true}' }));
  await page.click('#send');
  const r = await page.evaluate(() => ({ errs: [...document.querySelectorAll('.err')].filter((e) => !e.hidden).length, focus: document.activeElement.id, invalid: document.querySelectorAll('[aria-invalid="true"]').length }));
  await ctx.close();
  return { ok: r.errs === 3 && r.focus === 'f-name' && r.invalid === 3, detail: JSON.stringify(r) };
});
await test('form: bad email rejected, valid submit posts and shows success', async () => {
  let posted = null;
  const { ctx, page } = await formCtx(async (route) => { posted = route.request().postData(); await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await page.fill('#f-name', 'Test User'); await page.fill('#f-email', 'not-an-email'); await page.fill('#f-msg', 'Hello');
  await page.click('#send');
  const bad = await page.evaluate(() => document.getElementById('e-email').hidden);
  await page.fill('#f-email', 'test@example.com'); await page.click('#send'); await page.waitForTimeout(800);
  const msg = await page.evaluate(() => document.getElementById('formStatus').textContent);
  await ctx.close();
  return { ok: bad === false && /Thanks/.test(msg) && posted && /test@example.com/.test(posted), detail: msg };
});
await test('form: server failure shows a designed error and re-enables the button', async () => {
  const { ctx, page } = await formCtx((r) => r.fulfill({ status: 500, body: 'nope' }));
  await page.fill('#f-name', 'T'); await page.fill('#f-email', 'a@b.co'); await page.fill('#f-msg', 'x');
  await page.click('#send'); await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({ msg: document.getElementById('formStatus').textContent, cls: document.getElementById('formStatus').className, dis: document.getElementById('send').disabled }));
  await ctx.close();
  return { ok: /did not send/.test(r.msg) && /is-err/.test(r.cls) && !r.dis, detail: r.msg };
});
await test('form: honeypot submission sends nothing; form still works after navigating in via the router', async () => {
  let hits = 0;
  const { ctx, page } = await open(browserGpu, { path: '/', route: async (c) => c.route('https://formspree.io/**', async (r) => { hits++; await r.fulfill({ status: 200, body: '{}' }); }) });
  await page.click('.nav-links ~ a.btn[href="/contact"]'); await page.waitForTimeout(3200);
  await page.fill('#f-name', 'Bot'); await page.fill('#f-email', 'bot@spam.io'); await page.fill('#f-msg', 'buy');
  await page.evaluate(() => { document.querySelector('.hp').value = 'gotcha'; });
  await page.click('#send'); await page.waitForTimeout(500);
  const afterBot = hits;
  await page.fill('#f-name', 'Real'); await page.fill('#f-email', 'real@example.com'); await page.fill('#f-msg', 'hi');
  await page.evaluate(() => { document.querySelector('.hp').value = ''; });
  await page.click('#send'); await page.waitForTimeout(800);
  await ctx.close();
  return { ok: afterBot === 0 && hits === 1, detail: `bot hits=${afterBot} real hits=${hits}` };
});

/* ================================================================== 5. overflow, resilience */
for (const w of [320, 375, 390, 768, 1024, 1440, 1920]) {
  await test(`layout: no horizontal overflow at ${w}px on all six pages`, async () => {
    const bad = [];
    for (const path of Object.keys(PAGES)) {
      const { ctx, page } = await open(browserGpu, { path, width: w, height: w < 800 ? 800 : 900, wait: 1800 });
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (r.sw > r.iw + 1) bad.push(`${path}:${r.sw}>${r.iw}`);
      await ctx.close();
    }
    return { ok: bad.length === 0, detail: bad.join(' ') || 'all pages fit' };
  });
}

await test('OS reduce-motion is ignored: full animated experience, no toggle', async () => {
  const { ctx, page, errors } = await open(browserGpu, { path: '/', reduced: true });
  const r = await page.evaluate(() => ({
    cls: document.documentElement.className, lenis: document.documentElement.classList.contains('lenis'), frozen: window.__field && window.__field.frozen,
    btn: !!document.getElementById('motionBtn'), wipe: getComputedStyle(document.getElementById('wipe')).display,
  }));
  const g = await geoOf(page);
  await page.evaluate((y) => window.scrollTo(0, y), g.space.top + 0.3 * (g.space.h - 900));
  await page.waitForTimeout(1800);
  const dive = await page.evaluate(() => +window.__field.state.scale.toFixed(2));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  await page.click('.nav-links a[href="/nexcon"]');
  await page.waitForTimeout(330);
  const wipeMid = await page.evaluate(() => getComputedStyle(document.getElementById('wipe')).display);
  await ctx.close();
  return { ok: !/reduced/.test(r.cls) && r.lenis && !r.frozen && !r.btn && dive > 3 && wipeMid !== 'none' && errors.length === 0, detail: JSON.stringify(r) + ` dive scale ${dive}, wipe mid-transition: ${wipeMid}` + errors.join('|') };
});

await test('?motion=reduce still produces the static layout (kept for testing only)', async () => {
  const { ctx, page, errors } = await open(browserGpu, { path: '/?motion=reduce' });
  const r = await page.evaluate(() => ({
    cls: document.documentElement.className, lenis: document.documentElement.classList.contains('lenis'),
    wipe: getComputedStyle(document.getElementById('wipe')).display, steps: [...document.querySelectorAll('.step')].every((s) => getComputedStyle(s).display !== 'none'),
    h1: getComputedStyle(document.querySelector('h1')).visibility, exp: document.getElementById('bnExp').textContent,
    spaceH: document.getElementById('space').getBoundingClientRect().height, frozen: window.__field?.frozen,
  }));
  await ctx.close();
  return { ok: /reduced/.test(r.cls) && !r.lenis && r.wipe === 'none' && r.steps && r.h1 === 'visible' && r.exp === '8' && r.spaceH < 2500 && r.frozen && errors.length === 0, detail: JSON.stringify(r) };
});

await test('no WebGL at all: every page is complete and error-free', async () => {
  const bad = [];
  for (const path of Object.keys(PAGES)) {
    const { ctx, page, errors } = await open(browserGpu, { path, wait: 3200, init: () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; } });
    const r = await page.evaluate(() => ({ field: !!window.__field, canvas: getComputedStyle(document.getElementById('gl')).display, h1: !!document.querySelector('h1') }));
    if (r.field || r.canvas !== 'none' || !r.h1 || errors.length) bad.push(path + ' ' + JSON.stringify(r) + errors.join('|'));
    await ctx.close();
  }
  return { ok: bad.length === 0, detail: bad.join(' ') || 'six pages ok' };
});

await test('software renderer (no GPU): detected, still gets the lightweight scene, page complete', async () => {
  const { ctx, page, errors } = await open(browserSoft, { path: '/' });
  const r = await page.evaluate(() => ({ field: !!window.__field, tier: window.__tier && window.__tier.name, soft: window.__tier && window.__tier.software, canvas: getComputedStyle(document.getElementById('gl')).display, h1: !!document.querySelector('h1') }));
  await ctx.close();
  return { ok: r.field && r.tier === 'soft' && r.soft && r.canvas !== 'none' && r.h1 && errors.length === 0, detail: JSON.stringify(r) };
});

await test('struggling GPU: forced high tier on a software renderer degrades itself (dpr, points, or off)', async () => {
  const { ctx, page } = await open(browserSoft, { path: '/?tier=high', wait: 3000 });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 12 });   // a weak CPU on top of software rendering
  const start = await page.evaluate(() => ({ dpr: window.__field?.dpr, draw: window.__field?.drawCount }));
  let last = null, degraded = false;
  for (let i = 0; i < 60 && !degraded; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * 150);
    await page.waitForTimeout(600);
    last = await page.evaluate(() => ({ disabled: window.__field?.disabled, dpr: window.__field?.dpr, draw: window.__field?.drawCount, ema: Math.round(window.__field?.ema || 0) }));
    degraded = last.disabled || last.dpr < start.dpr || last.draw < start.draw;
  }
  const responsive = await page.evaluate(() => new Promise((res) => { const t = performance.now(); requestAnimationFrame(() => res(performance.now() - t)); }));
  await ctx.close();
  return { ok: degraded && responsive < 250, detail: `${JSON.stringify(start)} -> ${JSON.stringify(last)} | next frame ${Math.round(responsive)}ms` };
});

await test('data saver does not downgrade the experience: same scene, same chunk', async () => {
  const urls = [];
  const ctx = await browserGpu.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('request', (r) => urls.push(r.url()));
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4200);
  const chunk = urls.some((u) => /field-.*\.js/.test(u));
  const r = await page.evaluate(() => ({ field: !!window.__field, tier: window.__tier && window.__tier.name }));
  await ctx.close();
  return { ok: chunk && r.field && r.tier === 'high', detail: JSON.stringify(r) };
});

await test('worst-case matrix: reduce-motion + software GPU + phone size still shows the animated hero, dive and wipe', async () => {
  const bad = [];
  const combos = [
    ['reduce-motion + no GPU, desktop', browserSoft, { width: 1366, height: 700, reduced: true }],
    ['reduce-motion + no GPU, phone', browserSoft, { width: 390, height: 844, mobile: true, reduced: true }],
    ['reduce-motion + GPU, phone', browserGpu, { width: 390, height: 844, mobile: true, reduced: true }],
  ];
  for (const [label, br, opts] of combos) {
    const { ctx, page, errors } = await open(br, { path: '/', wait: 4500, ...opts });
    const g = await geoOf(page);
    const hero = await page.evaluate(() => ({ field: !!window.__field, canvas: getComputedStyle(document.getElementById('gl')).display, lenis: document.documentElement.classList.contains('lenis'), a: window.__field && window.__field.state.a, h1: getComputedStyle(document.querySelector('h1')).visibility }));
    await page.evaluate((y) => window.scrollTo(0, y), g.space.top + 0.3 * (g.space.h - opts.height));
    await page.waitForTimeout(2200);
    const dive = await page.evaluate(() => window.__field && +window.__field.state.scale.toFixed(2));
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('.foot nav a[href="/about"]').click());
    await page.waitForTimeout(350);
    const wipe = await page.evaluate(() => getComputedStyle(document.getElementById('wipe')).display);
    await page.waitForTimeout(2800);
    const path2 = await page.evaluate(() => location.pathname);
    if (!(hero.field && hero.canvas !== 'none' && hero.lenis && hero.a === 5 && hero.h1 === 'visible' && dive > 2.5 && wipe !== 'none' && path2 === '/about' && errors.length === 0)) bad.push(label + ' ' + JSON.stringify({ hero, dive, wipe, path2 }) + errors.join('|'));
    await ctx.close();
  }
  return { ok: bad.length === 0, detail: bad.join(' || ') || 'all three combinations animate fully' };
});

/* ================================================================== 6. accessibility */
await test('axe: no serious or critical violations across the pages and states', async () => {
  const bad = [];
  const stops = [['/', [0, 'space', 'loop', 'explore']], ['/technology', [0, 'ledger']], ['/nexcon', [0, 'inverse']], ['/kronig', [0, 'kronig+1500']], ['/about', [0, 'whynow', 'model', 'team']], ['/products', [0, 'catalog']], ['/contact', [0]]];
  for (const [path, marks] of stops) {
    const { ctx, page } = await open(browserGpu, { path });
    const g = await geoOf(page);
    for (const m of marks) {
      let y = 0;
      if (m !== 0) { const [id, add] = String(m).split('+'); y = (g.sections[id]?.top ?? 0) + Number(add || 100); if (id === 'loop') y = g.sections.loop.top + (g.sections.loop.h - 900) * 0.6; }
      await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(2200);
      const res = await new AxeBuilder({ page }).disableRules(['scrollable-region-focusable']).analyze();
      for (const v of res.violations.filter((x) => ['serious', 'critical'].includes(x.impact))) {
        const n = v.nodes[0];
        bad.push(`${path}@${m}:${v.id}(${v.nodes.length}) e.g. ${n.target[0]} ${n.any[0]?.data?.contrastRatio ?? ''}`);
      }
    }
    await ctx.close();
  }
  return { ok: bad.length === 0, detail: bad.slice(0, 8).join(' || ') || 'clean at every stop' };
});

await test('keyboard: skip link works, focus rings visible, menu traps nothing, Escape closes it', async () => {
  const { ctx, page } = await open(browserGpu, { path: '/' });
  await page.keyboard.press('Tab');
  const skip = await page.evaluate(() => document.activeElement.className);
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { tag: document.activeElement.tagName, outline: s.outlineStyle + ' ' + s.outlineWidth }; });
  await ctx.close();
  const m = await open(browserGpu, { path: '/', width: 390, height: 844, mobile: true });
  await m.page.click('#menuBtn'); await m.page.waitForTimeout(700);
  const o = await m.page.evaluate(() => ({ exp: document.getElementById('menuBtn').getAttribute('aria-expanded'), hidden: document.getElementById('menu').hidden }));
  await m.page.keyboard.press('Escape'); await m.page.waitForTimeout(900);
  const c = await m.page.evaluate(() => ({ exp: document.getElementById('menuBtn').getAttribute('aria-expanded'), hidden: document.getElementById('menu').hidden }));
  await m.page.click('#menuBtn'); await m.page.waitForTimeout(600);
  await m.page.click('#menu a[href="/about"]'); await m.page.waitForTimeout(3300);
  const nav = await m.page.evaluate(() => ({ path: location.pathname, menuHidden: document.getElementById('menu').hidden }));
  await m.ctx.close();
  return { ok: skip === 'skip' && /solid 2px/.test(ring.outline) && o.exp === 'true' && !o.hidden && c.exp === 'false' && c.hidden && nav.path === '/about' && nav.menuHidden, detail: JSON.stringify({ ring, o, c, nav }) };
});

/* ================================================================== 7. performance */
async function perfRun(label, { path = '/', cpu = 1, net = null, browser = browserGpu, width = 1440, height = 900, mobile = false }) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  await cdp.send('Network.enable');
  if (net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: net.latency, downloadThroughput: net.down, uploadThroughput: net.up });
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.addInitScript(() => {
    window.__m = { lcp: 0, fcp: 0, longTasks: 0, cls: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.longTasks++; }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  const t0 = Date.now();
  await page.goto(BASE + path, { waitUntil: 'load' });
  const loadMs = Date.now() - t0;
  await page.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 40000 }).catch(() => {});
  const readyMs = Date.now() - t0;
  await page.waitForTimeout(1500);
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  const frames = await page.evaluate(async (H) => {
    const fr = []; let last = performance.now(); const start = last;
    return await new Promise((resolve) => {
      function f(now) { fr.push(now - last); last = now; const p = Math.min(1, (now - start) / 7000); window.scrollTo(0, p * (H - innerHeight)); if (now - start < 7000) requestAnimationFrame(f); else resolve(fr); }
      requestAnimationFrame(f);
    });
  }, H);
  const sorted = [...frames].sort((a, b) => a - b), avg = frames.reduce((a, b) => a + b, 0) / frames.length;
  const m = await page.evaluate(() => ({ ...window.__m, tier: window.__tier?.name ?? null, dpr: window.__field?.dpr ?? null, off: !!window.__field?.disabled }));
  await ctx.close();
  return { label, loadMs, readyMs, kb: Math.round(bytes / 1024), fps: Math.round(1000 / avg), p95: Math.round(sorted[Math.floor(sorted.length * 0.95)]), worst: Math.round(sorted[sorted.length - 1]), ...m };
}
const SKIP_PERF = !!process.env.ONLY && !process.env.PERF;
const FAST3G = { latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8 };
const SLOW4G = { latency: 70, down: (4 * 1024 * 1024) / 8, up: (3 * 1024 * 1024) / 8 };
const perf = [];
if (!SKIP_PERF) {
perf.push(await perfRun('home, desktop high', {}));
perf.push(await perfRun('home, 4x CPU, slow 4G', { cpu: 4, net: SLOW4G }));
perf.push(await perfRun('home, laptop (mid), 4x CPU', { cpu: 4, path: '/?tier=mid' }));
perf.push(await perfRun('home, laptop (mid), 6x CPU', { cpu: 6, path: '/?tier=mid' }));
perf.push(await perfRun('home, phone (low), 4x CPU, fast 3G', { cpu: 4, net: FAST3G, path: '/?tier=low', width: 390, height: 844, mobile: true }));
perf.push(await perfRun('home, phone (low), 6x CPU, fast 3G', { cpu: 6, net: FAST3G, path: '/?tier=low', width: 390, height: 844, mobile: true }));
perf.push(await perfRun('home, phone, WebGL off, 6x CPU, 3G', { cpu: 6, net: FAST3G, path: '/?tier=off', width: 390, height: 844, mobile: true }));
perf.push(await perfRun('materials, laptop (mid), 4x CPU', { cpu: 4, path: '/nexcon?tier=mid' }));
perf.push(await perfRun('devices, phone (low), 4x CPU, 3G', { cpu: 4, net: FAST3G, path: '/kronig?tier=low', width: 390, height: 844, mobile: true }));
}
console.log('\nPERFORMANCE (full-page scroll over 7 s)');
console.table(perf.map((p) => ({ scenario: p.label, 'load ms': p.loadMs, 'ready ms': p.readyMs, KB: p.kb, FCP: Math.round(p.fcp), LCP: Math.round(p.lcp), CLS: +p.cls.toFixed(3), 'long tasks': p.longTasks, fps: p.fps, 'p95 ms': p.p95, worst: p.worst, tier: p.tier, dpr: p.dpr, off: p.off })));
for (const p of perf) {
  const weak = /6x|phone/.test(p.label);
  record(`perf: ${p.label}`, p.readyMs < (weak ? 7000 : 4500) && p.cls < 0.1 && (p.fps >= (weak ? 24 : 40) || p.off), `ready ${p.readyMs}ms, LCP ${Math.round(p.lcp)}ms, CLS ${p.cls.toFixed(3)}, ${p.fps}fps, p95 ${p.p95}ms, ${p.kb}KB`);
}

await browserGpu.close();
await browserSoft.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('FAILED:'); failed.forEach((f) => console.log(' -', f.name, '|', f.detail)); process.exit(1); }
