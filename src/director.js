/**
 * The director turns scroll position into scene state, in one place, so nothing fights
 * over the same uniforms.
 *
 * Home is a scripted sequence (the camera story):
 *   hero      a huge crystal with sonar-style phonon ripples, headline on the left
 *   space     scroll DIVES into the lattice until atoms fill the screen, then the crystal
 *             dissolves into the search space ("one candidate" -> "10^8")
 *   loop      the five-step discovery loop on a pinned screen (funnel, oracle ring, crystal)
 *   explore   orbits / crystal behind the way-in links
 * Every other page is described by data-pose attributes on its sections, interpolated by
 * scroll: data-pose="st:8;op:1;ox:3.4;sc:1.3;rp:.4;du:.7;cl:-1 -1 -.08 1;ck:.9".
 */
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mixRect = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

const DEFAULT = { st: 8, op: 1, ox: 0, oy: 0, sc: 1, rp: 0, du: 0, cl: [-1, -1, -0.1, 1], ck: 0 };

function parsePose(str, base = DEFAULT) {
  const p = { ...base, cl: [...base.cl] };
  str.split(';').forEach((kv) => {
    const i = kv.indexOf(':');
    if (i < 0) return;
    const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    if (k === 'cl') p.cl = v.split(/\s+/).map(Number);
    else p[k] = parseFloat(v);
  });
  return p;
}

export function createDirector(env) {
  const D = {
    a: 8, b: 8, m: 0, sc: 1, ox: 0, oy: 0, op: 1, rp: 0, du: 0, ck: 0, cl: [-1, -1, 0.4, 0.35],
    vel: 0, lastY: 0, rotY: 0, rotX: 0,
  };
  const geo = {};
  let anchors = [];
  let coreBox = null;
  let crystalBox = null;
  let markBox = null;
  let mobileBox = null;
  let loopCopy = null;

  let heroMarkWidth = 0;
  let heroTrack = null;
  let startupProgress = 1;
  let page = 'home';
  const mobile = () => innerWidth <= 820;

  const loopClear = (mob) => (mob ? [-1, -1, 1, -0.05] : [-1, -1, -0.12, 1]);

  /** phone layout: centre the visual in the top half, text sits underneath */
  function adapt(p) {
    if (!mobile()) return p;
    const q = { ...p, cl: [...p.cl] };
    if (q.st === 12) {
      q.sc *= 0.86;
      q.oy = 0.35;
    }
    if (q.ox > 0) { q.oy = q.oy || 2.3; q.ox = 0; }
    if (q.cl[2] < 0.5 && q.cl[0] <= -0.9) q.cl = [-1, -1, 1, -0.05];
    if (q.sc > 1.2) q.sc *= 1.15;
    if (q.sc > 1.2 && q.oy) q.oy += 1;
    return q;
  }

  function rebuild() {
    page = document.body.dataset.page || 'home';
    loopCopy = document.querySelector('.loop-copy');

    const y = window.scrollY;
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top + y, h: r.height }; };
    const sceneBox = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect?.height ? { top: rect.top + y, left: rect.left, width: rect.width, height: rect.height } : null;
    };
    heroMarkWidth = document.querySelector('.hero-signature')?.getBoundingClientRect().width ?? 0;
    const track = document.querySelector('.hero-track');
    const hero = document.getElementById('top');
    heroTrack = track && hero ? box(track) : null;
    if (heroTrack) {
      heroTrack.travel = getComputedStyle(hero).position === 'sticky' ? Math.max(0, heroTrack.h - hero.offsetHeight) : 0;
    }
    coreBox = sceneBox('#coreSvg');
    crystalBox = sceneBox('[data-crystal-scene]');
    markBox = sceneBox('[data-mark-scene]');
    mobileBox = sceneBox('.mobile-scene');
    Object.keys(geo).forEach((k) => delete geo[k]);
    ['top', 'space', 'loop', 'explore'].forEach((id) => { const el = document.getElementById(id); if (el) geo[id] = box(el); });
    geo.page = document.documentElement.scrollHeight;
    geo.sections = {};
    $$('main section[id]').forEach((el) => { geo.sections[el.id] = box(el); });
    if (heroTrack) geo.sections.top = heroTrack;
    Object.assign(geo, geo.sections); // flat access for tests: geo.kronig.top

    anchors = [];
    $$('main [data-pose]').forEach((el) => {
      const b = box(el);
      const base = parsePose(el.dataset.pose);
      anchors.push({ at: b.top + b.h * parseFloat(el.dataset.at ?? 0.5), ...base });
      if (el.dataset.pose2) {
        anchors.push({ at: b.top + b.h * parseFloat(el.dataset.at2 ?? 0.85), ...parsePose(el.dataset.pose2, base) });
      }
    });
    anchors.sort((a, b2) => a.at - b2.at);

    if (page === 'home' && geo.loop) {
      const vh = innerHeight, mob = mobile();
      anchors.unshift({ at: geo.loop.top + geo.loop.h - vh * 0.5, st: 8, op: 1, ox: mob ? 0 : 3.2, oy: mob ? 2.3 : 0, sc: 1, rp: 0, du: 0, cl: loopClear(mob), ck: 0.92 });
    }
    anchors = anchors.map(adapt);
    return geo;
  }

  /** generic pose from the anchors, evaluated at the viewport centre */
  function anchorPose(y) {
    const vh = innerHeight, yc = y + vh * 0.5;
    if (!anchors.length) return { ...adapt(DEFAULT), a: 8, b: 8, m: 0 };
    let i = 0;
    while (i < anchors.length - 1 && yc > anchors[i + 1].at) i++;
    const a = anchors[i], b = anchors[Math.min(i + 1, anchors.length - 1)];
    const t = i === anchors.length - 1 || yc <= a.at && i === 0 ? 0 : sstep(0, 1, clamp((yc - a.at) / Math.max(1, b.at - a.at)));
    const hold = yc <= anchors[0].at;
    const tt = hold ? 0 : t;
    const P = {
      op: lerp(a.op, b.op, tt), ox: lerp(a.ox, b.ox, tt), oy: lerp(a.oy, b.oy, tt), sc: lerp(a.sc, b.sc, tt),
      rp: lerp(a.rp, b.rp, tt), du: lerp(a.du, b.du, tt), cl: mixRect(a.cl, b.cl, tt), ck: lerp(a.ck, b.ck, tt),
    };
    if (a.st === b.st || hold) { P.a = a.st; P.b = a.st; P.m = 0; }
    else { P.a = a.st; P.b = b.st; P.m = tt; }
    return P;
  }

  function homeTarget(y, showWordmark) {
    const vh = innerHeight, mob = mobile();
    if (y >= vh * .08) startupProgress = 1;
    const hx = 0, hy = mob ? -0.35 : -1.95;
    const phoneFit = Math.min(1, innerWidth / vh / 0.46);
    const heroScale = mob ? 1.02 * phoneFit : 0.93;
    const lx = mob ? 0 : 3.2, ly = mob ? 2.3 : 0;
    const T = { a: 8, b: 8, m: 0, sc: heroScale, ox: hx, oy: hy, op: 1, rp: 0.55, du: 1, cl: mob ? [-1, -1, 1, 0.15] : [-1, -1, 0.4, 0.35], ck: 0.05, lp: 0, sp: 0, da: 0, sb: 0 };
    const spaceTop = geo.space.top, spaceH = geo.space.h, loopTop = geo.loop.top;
    const travel = heroTrack?.travel || vh;
    const mission = sstep(travel * .38, travel * .74, y);
    const exit = sstep(travel, spaceTop, y);
    T.hm = mission;
    T.hp = sstep(travel * .11, travel * .35, y) * (1 - sstep(travel * .36, travel * .72, y));

    if (y < spaceTop) {
      T.sc = lerp(heroScale * .87, 2.1, exit);
      T.oy = lerp(mob ? .2 : .45, hy, exit);
      T.op = lerp(1 - .82 * mission, 1, exit);
      T.ck = lerp(.16 * mission, .5, exit);
    } else {
      // space: dive into the lattice, then dissolve into the search space
      const sp = clamp((y - spaceTop) / (spaceH - vh));
      T.sp = sp;
      const dive = sstep(0, 0.28, sp);
      const morph = sstep(0.22, 0.7, sp);
      T.sc = lerp(2.1, 3.4, dive);
      T.ox = lerp(hx * 0.55, 0, dive);
      T.oy = lerp(hy, 0, dive);
      if (morph > 0) {
        T.a = 8; T.b = 0; T.m = morph;
        T.sc = lerp(3.4, 1.25, sstep(0, 1, morph));
        T.rp = lerp(1.5, 0.1, morph);
        T.du = lerp(1, 0, morph);
      }
      if (sp >= 0.7) { T.a = 0; T.b = 0; T.m = 0; }
      T.cl = mob ? [-1, -1, 1, -0.02] : [-1, -1, 1, -0.02];
      T.ck = lerp(0.5, 0.7, morph);
      T.da = 0;
      T.sb = sstep(0.42, 0.58, sp);
    }

    // Push through the lettering, then let the emblem settle behind the mission copy.
    if (showWordmark && heroMarkWidth && y < spaceTop) {
      const progress = sstep(travel * .09, travel * .67, y);
      if (progress < 1) {
        const fit = Math.max(.5, Math.min(1, innerWidth / vh / 1.75));
        const units = 36 * Math.tan(Math.PI / 9) / vh;
        T.a = 7;
        T.b = 8;
        T.m = .16 + .68 * progress;
        const wordmarkScale = heroMarkWidth * units / (11.5 * fit);
        T.sc = lerp(wordmarkScale, T.sc, progress) + wordmarkScale * .78 * Math.sin(Math.PI * progress);
        T.ox *= progress;
        T.oy *= progress;
        T.rp = lerp(.17, T.rp, progress) + .45 * T.hp;
        T.ck *= progress;
        if (startupProgress < 1) {
          T.a = 8;
          T.b = 7;
          T.m = .16 + .68 * startupProgress;
          T.sc *= lerp(.65, 1, startupProgress);
          T.rp = lerp(.48, T.rp, startupProgress);
        }
      }
    }

    // entering the loop: settle the cloud into the loop pose
    const e = sstep(0, 1, (y - (loopTop - vh)) / vh);
    if (e > 0) {
      T.sc = lerp(T.sc, mob ? 0.82 * phoneFit : 1, e); T.ox = lerp(T.ox, lx, e); T.oy = lerp(T.oy, ly, e);
      T.cl = mixRect(T.cl, loopClear(mob), e); T.ck = lerp(T.ck, 0.92, e);
      T.rp = lerp(T.rp, 0, e); T.du = lerp(T.du, 0, e);
    }
    T.sb = Math.max(T.sb, sstep(0, 0.5, e));

    const lp = clamp((y - loopTop) / (geo.loop.h - vh));
    T.lp = lp;
    if (y >= loopTop - 1) {
      const stage = lp * 5;
      const k = Math.min(5, Math.floor(stage));
      T.a = k === 5 ? 8 : k;
      T.b = k >= 4 ? 8 : k + 1;
      T.m = k === 5 ? 0 : stage - k;
      // Ease the horizontal adjustment in and out with the Define pose.
      const defineWeight = T.a === 1 ? 1 - sstep(0.16, 0.84, T.m)
        : T.b === 1 ? sstep(0.16, 0.84, T.m) : 0;
      T.ox += (innerWidth <= 1024 ? -0.8 : 0.15) * defineWeight;
      if (mob && loopCopy) {
        const top = 64;
        const room = Math.max(110, loopCopy.getBoundingClientRect().top - top - 12);
        const aspect = innerWidth / vh;
        const fit = Math.max(0.5, Math.min(1, aspect / 1.75));
        const units = 36 * Math.tan(Math.PI / 9) / vh;
        const frame = sstep(0, 0.08, lp);
        const fittedScale = Math.min(innerWidth * 0.91 * units / 9.7, room * 0.90 * units / 8.5) / fit;
        T.sc = lerp(T.sc, fittedScale, frame);
        T.oy = lerp(T.oy, (vh / 2 - top - room / 2) * units, frame);
        T.cl = [-1, -1, 1, 1 - (top + room) / vh * 2];
      }
    }
    return T;
  }

  function frameMobileScene(pose, y) {
    if (!mobile() || !mobileBox) return;
    const rect = mobileBox;
    const top = rect.top - y, bottom = top + rect.height;
    if (bottom < 0 || top > innerHeight) return;
    const vh = innerHeight;
    const fit = Math.max(0.5, Math.min(1, innerWidth / vh / 1.75));
    const units = 36 * Math.tan(Math.PI / 9) / vh;
    const frameWeight = sstep(0, rect.height * 0.65, Math.min(bottom, vh - top));
    const scale = Math.min(rect.width * units / 10.3, rect.height * units / 9.8) / fit;
    pose.sc = lerp(pose.sc, scale, frameWeight);
    pose.ox = lerp(pose.ox, 0, frameWeight);
    pose.oy = lerp(pose.oy, (vh / 2 - top - rect.height / 2) * units, frameWeight);
    pose.ck = lerp(pose.ck, 0.04, frameWeight);
    pose.op = lerp(pose.op, 1, frameWeight);
  }

  /** @returns the target scene for this scroll position */
  function target(y, showWordmark) {
    const yc = y + innerHeight * 0.5;
    if (page === 'home' && geo.loop && geo.space) {
      const loopEnd = geo.loop.top + geo.loop.h - innerHeight * 0.5;
      if (yc <= loopEnd) return homeTarget(y, showWordmark);
      const P = anchorPose(y);
      frameMobileScene(P, y);
      P.lp = 1; P.sp = 1; P.da = 0; P.sb = 1;
      return P;
    }
    const P = anchorPose(y);
    frameMobileScene(P, y);
    const visualBox = P.a === 11 || P.b === 11 ? crystalBox : markBox;
    if (visualBox) {
      const rect = visualBox;
      const top = rect.top - y;
      const vh = innerHeight, vw = document.documentElement.clientWidth;
      const fit = Math.max(0.5, Math.min(1, innerWidth / vh / 1.75));
      const units = 36 * Math.tan(Math.PI / 9) / vh;
      P.ox = (rect.left + rect.width / 2 - vw / 2) * units / fit;
      P.oy = (vh / 2 - top - rect.height / 2) * units;
      P.sc = Math.min(rect.width, rect.height) * units / (10.5 * fit);
      P.op *= sstep(0, rect.height * .35, Math.min(top + rect.height, vh - top));
    }
    if (coreBox && (P.a === 10 || P.b === 10)) {
      const rect = coreBox;
      const fit = Math.max(0.5, Math.min(1, innerWidth / innerHeight / 1.75));
      const units = 2 * 18 * Math.tan(Math.PI / 9) / innerHeight;
      const weight = P.a === P.b ? 1 : P.a === 10 ? 1 - P.m : P.m;
      P.ox = lerp(P.ox, (rect.left + rect.width / 2 - document.documentElement.clientWidth / 2) * units / fit, weight);
      P.oy = lerp(P.oy, (innerHeight / 2 - rect.top + y - rect.height / 2) * units, weight);
      P.sc = lerp(P.sc, Math.min(rect.width / 600, rect.height / 560) * 140 * units / (3.1 * fit), weight);
    }
    P.lp = 0; P.sp = 0; P.da = 0; P.sb = 1;
    return P;
  }

  /** advance one frame; writes straight into the field's state */
  function update(y, dt, clock, field, pointerN) {
    const T = target(y, Boolean(field?.hasWordmark));
    const k = 1 - Math.exp(-dt * (T.a === 7 ? 13 : 7));
    D.sc = lerp(D.sc, T.sc, k); D.ox = lerp(D.ox, T.ox, k); D.oy = lerp(D.oy, T.oy, k);
    D.op = lerp(D.op, T.op, k); D.rp = lerp(D.rp, T.rp, k); D.du = lerp(D.du, T.du, k);
    D.ck = lerp(D.ck, T.ck, k);
    D.cl = D.cl.map((v, i) => lerp(v, T.cl[i], k));
    // state pair is taken straight from scroll (Lenis already eases it); a changed pair never pops
    D.a = T.a; D.b = T.b; D.m = T.m;
    const vT = clamp(((y - D.lastY) / Math.max(dt, 0.001)) * 0.00035, -1, 1);
    D.vel = lerp(D.vel, vT, 1 - Math.exp(-dt * 10));
    D.lastY = y;
    // pointer parallax tilts the whole structure
    D.rotY = lerp(D.rotY, (pointerN.x - 0.5) * 0.7, 1 - Math.exp(-dt * 3));
    D.rotX = lerp(D.rotX, (pointerN.y - 0.5) * 0.35, 1 - Math.exp(-dt * 3));

    if (field) {
      const s = field.state;

      s.a = D.a; s.b = D.b; s.m = D.m;
      s.scale = D.sc; s.offsetX = D.ox; s.offsetY = D.oy;
      // Screen-space lower boundary, shared by the wafer and its edge particles.
      s.waferBoundary = geo.explore
        ? (geo.explore.top + geo.explore.h - y) / innerHeight
        : 1;
      s.ripple = D.rp; s.dust = D.du; s.clear = D.cl; s.clearK = D.ck; s.vel = D.vel;
      // the slow spin is wrapped to (-pi, pi] so it can never grow without bound
      let spin = (0.3 + (y / Math.max(1, geo.page)) * 2.2 + clock * 0.03) % (2 * Math.PI);
      if (spin > Math.PI) spin -= 2 * Math.PI;
      s.rot = spin + D.rotY;
      s.rotX = D.rotX;
      s.par[0] = D.rotY; s.par[1] = D.rotX;
      s.twist = D.a === 7 || D.b === 7 ? 1 : 0;
    }
    return { T, D };
  }

  return {
    rebuild, update, geo,
    setStartup(progress) { startupProgress = progress; },
    get startup() { return startupProgress; },
    get anchors() { return anchors; },
    get D() { return D; },
  };
}
