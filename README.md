# NovAtom Labs website

Source for [novatomlabs.com](https://novatomlabs.com): the marketing site for NovAtom Labs, a company building an autonomous research-lab platform (materials and semiconductors first).

It is a seven-page static site with a WebGL crystal scene that follows the visitor's scroll. There is no backend: the contact form posts to a hosted form service, and the build output is plain files that any static host can serve.

| | |
|---|---|
| Build tool | [Vite](https://vite.dev) 8, multi-page |
| Rendering | Raw WebGL2 point renderer (no Three.js) |
| Motion | [GSAP](https://gsap.com) (ScrollTrigger, SplitText, ScrambleText) and [Lenis](https://lenis.darkroom.engineering) smooth scroll |
| Type | Bricolage Grotesque, Newsreader, JetBrains Mono (self-hosted through Fontsource) |
| Tests | Playwright end-to-end suite with axe accessibility checks |

## Quick start

You need Node.js 20 or newer.

```bash
git clone git@github.com:Satyagni/novatom-website.git
cd novatom-website
npm install
npm run dev          # http://127.0.0.1:5173 with hot reload
```

To see the production build instead:

```bash
npm run build        # writes the finished site to dist/
npm run preview      # serves dist/ at http://127.0.0.1:4173
```

On Windows, `START-WEBSITE.bat` does the install, build and preview in one double-click and opens the browser.

The site must be served over http. Opening `index.html` straight from disk will not work.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload (port 5173). Editing a file in `partials/` reloads the page. |
| `npm run build` | Production build into `dist/`. |
| `npm run preview` | Serves `dist/` on port 4173. The tests expect this port. |
| `npm run test:e2e` | Runs the end-to-end suite against the preview server. Build and start the preview first. |

## Which guide to read

| If you want to... | Read |
|---|---|
| Change wording, add a section, edit the nav or footer, add a page | [docs/CONTENT-GUIDE.md](docs/CONTENT-GUIDE.md) |
| Understand how the scene, scroll director and opener fit together before changing motion | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Put the site on a host and point the domain at it | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Run the tests, profile a stutter, or debug on one machine | [docs/TESTING.md](docs/TESTING.md) |
| Submit a change | [CONTRIBUTING.md](CONTRIBUTING.md) |

## Repository layout

```
index.html, technology.html, products.html,    The seven pages. Each one is a thin file that
nexcon.html, kronig.html, about.html,          includes shared head/nav/footer and its sections
contact.html                                   from partials/.
partials/                                      HTML fragments: head, nav (chrome), footer, and one
                                               file per section (s-hero.html, s-space.html, ...).
src/
  main.js                                      Boot, page transitions, opener, smooth scroll, nav.
  director.js                                  Turns scroll position into scene state.
  pages.js                                     Per-page behaviour: headings, the loop, the form.
  fx.js                                        Cursor, reactive type, marquee, wipe, scroll-dot rail.
  scene/                                       WebGL: field.js (renderer), shaders.js, lattices.js,
                                               wordmark.js, tier.js (device budget).
  styles.css, v2.css                           Design tokens and layout (v2.css layers on styles.css).
public/                                        Copied as is: favicon, og.png, robots.txt, sitemap.xml,
                                               _headers (Cloudflare/Netlify caching).
tests/
  e2e.mjs, audit.mjs                           The regression suite and the click-through audit.
  diagnostics/                                 One-off scripts used while tuning motion and performance.
docs/                                          The guides listed above.
vercel.json                                    Clean URLs and cache headers for Vercel.
```

## Things worth knowing before you change anything

- **Nothing in the repo is a secret.** The contact form posts to a public Formspree endpoint (`FORM_ENDPOINT` in `src/pages.js`). Formspree form IDs are meant to be public. There are no API keys, tokens or `.env` files.
- **Everyone gets the same design.** The OS "reduce motion" setting is deliberately ignored. A device that cannot keep up is handled by a frame-time governor that lowers the point count, not by a different layout. `?motion=reduce` exists only to test the static layout.
- **Debug switches** are query parameters: `?debug` (on-screen stats), `?tier=off|low|mid|high` (force a GPU budget), `?motion=reduce`, `?safe` (no cursor, wipe or smooth scroll). See [docs/TESTING.md](docs/TESTING.md).
- **The wordmark intro is available through Replay.** Set `const OPENER = false;` in `src/main.js` to disable it.

## Licence

No open-source licence is attached, so all rights are reserved by default: the source is public to read, not to reuse. Add a `LICENSE` file if you want to allow that.

Third-party packages keep their own licences (Vite, Lenis and the Fontsource packages are MIT or OFL; GSAP is under its own free licence).
