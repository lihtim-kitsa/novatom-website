# Architecture

A map of how the site runs, for someone about to change motion, the scene or navigation. For content edits use [CONTENT-GUIDE.md](CONTENT-GUIDE.md).

## Build

The Next.js App Router prerenders the TypeScript routes in `app/`. `app/site-page.tsx` expands the trusted HTML fragments in `partials/` at render time. `app/site-runtime.tsx` loads the existing browser-side GSAP and WebGL code after hydration. The motion runtime owns the fragment DOM and keeps the WebGL canvas alive across in-site transitions.

## Boot and navigation (`src/main.js`)

- `detectTier()` chooses a GPU budget (below). If WebGL2 is unavailable the canvas is hidden and the page still works as static content.
- The WebGL module (`scene/field.js`) is imported after first paint so it does not delay the first render.
- **In-site navigation does not reload the page.** `go()` fetches the target HTML, plays a scanline wipe, swaps `#main`, updates the title, description and `data-page`, pushes history, re-runs `initPage()` and reveals. The canvas, renderer and Lenis instance live across pages, which is what lets the crystal morph between pages. If anything fails, it falls back to a normal full load. Back and forward are queued if they arrive mid-transition.
- `initPage()` wires everything that depends on the current page's DOM: headings, the scroll-dot rail, the loop section, the form, and the director's section anchors.
- Smooth scroll is [Lenis](https://lenis.darkroom.engineering), driven from the same ticker as GSAP.

## The scroll director (`src/director.js`)

One place turns scroll position into scene state, so nothing fights over the same uniforms. Each frame it computes a target (`T`), eases the live values (`D`) toward it, and writes them to the renderer's state.

- **Home** is a scripted sequence: hero crystal with ripples, a dive into the lattice, dissolve into the search space, the five-step loop on a pinned screen, then orbits behind the way-in links.
- **Every other page** is data-driven: each `<section data-pose="...">` describes a scene pose, and the director interpolates between neighbours by scroll. See the table in [CONTENT-GUIDE.md](CONTENT-GUIDE.md).
- The director also drives page chrome during the opener (nav, rail and headline opacity are written straight onto those three elements rather than through a CSS variable on `<html>`, because changing a variable on the root restyles the whole page every frame).

## The renderer (`src/scene/`)

| File | Role |
|---|---|
| `field.js` | Creates the WebGL2 context, uploads attributes and uniforms, draws points and bond lines, runs the frame-time governor. |
| `shaders.js` | Vertex and fragment shaders. Each point has a position in two scene states (`uA`, `uB`) and a mix (`uM`), plus a per-point stagger, so any state can morph into any other on the GPU. `statePos()` defines the eight states. |
| `lattices.js` | Crystal structures (wurtzite for GaN and AlGaN, 4H SiC, HfO2) generated as point sets with species. Also the `MATERIALS` list shown in the UI. |
| `wordmark.js` | Samples the "NovAtom Labs" wordmark into target positions for state 7. |
| `tier.js` | Device budget. |

Points are drawn with additive blending. Bond lines are a second draw pass over the same data.

### Device budget (`tier.js`)

| Tier | Points | Frame rate | Chosen when |
|---|---|---|---|
| `high` | 40,000 | 60 | normal desktop |
| `mid` | 22,000 | 60 | only forced with `?tier=mid` |
| `low` | 14,000 | 30 | phone, coarse pointer, or 2 or fewer cores / 2 GB or less memory |
| `soft` | 10,000 | 24 | software renderer (SwiftShader, llvmpipe, Basic Render) |

The same scenes run at every tier. If frames regularly exceed the budget, the governor in `field.js` lowers resolution and point count, then turns the canvas off if needed. The document renders before WebGL initializes. The renderer polls shader-link completion where the browser supports parallel shader compilation.

## The opener (`src/main.js`, `director.js`, `shaders.js`)

A direct visit to Home shows a progress counter while WebGL initializes and draws the particle wordmark. The counter follows setup milestones and has an eight-second fallback. Once revealed, the wordmark morphs into the hero crystal on a click, key press or scroll gesture, or after 1.5 seconds. Replay runs the wordmark sequence again.

State machine: `openState` is `'name'`, `'morphing'`, `'rewind'` or `'done'`.

- A 2.6-second linear GSAP tween drives `openObj.p` from 0 to 1. The shader staggers each point and the director coordinates the crystal, nav and headline.
- The replay buttons (`[data-replay]`, in the hero and footer) run the tween backwards over 2.8 s with `sine.inOut`, then re-arm the opener. From another page they navigate home first.
- The wordmark follows pointer parallax only (`uPar`), not a clock-driven spin, so it cannot drift or tilt over time.
- `warmChrome()` runs a few frames with the nav, rail and headline faintly painted before the first reveal. A first paint of some CSS effects triggers a GPU shader compile that shows up as a visible stall mid-morph.
- **Switch it off:** `const OPENER = false;` at the top of `src/main.js`.

## Styles

`src/styles.css` holds design tokens (colour, type, spacing) and base components. `src/v2.css` is loaded after it and holds the layout and the later components (opener, rail, replay buttons, logo). Both are imported from `main.js`.

## Accessibility and fallbacks

- Skip link, landmarks, `aria-current` on the rail and nav, and an `aria-live` step announcer on the loop section.
- A `<noscript>` block in `app/site-page.tsx` makes the tall scroll sections flow normally and hides the canvas, so the content is readable without JavaScript.
- Opening an HTML file from disk (`file:`) shows an explanation instead of a broken page.
- The e2e suite runs axe against every page.

## Where to start for common changes

| Change | Start at |
|---|---|
| Opener timing | `MORPH_SECONDS`, `IDLE_SECONDS` and the rewind tween in `src/main.js`; the opener block in `src/director.js` |
| Morph look (twist, scatter) | `vortex` block after `vec3 p = mix(pA, pB, fi)` in `src/scene/shaders.js` |
| Point counts, frame rates | `PRESETS` in `src/scene/tier.js` |
| Page-transition wipe | `createWipe` in `src/fx.js` |
| Scroll-dot behaviour | `buildRail` in `src/fx.js` and the rail callback in `initPage()` in `src/main.js` |
