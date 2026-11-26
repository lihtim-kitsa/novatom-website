# NovAtom Labs website

Source for [novatomlabs.com](https://novatomlabs.com): the marketing site for NovAtom Labs, a company building an autonomous research-lab platform (materials and semiconductors first).

Next.js prerenders eight content pages and a custom 404. A WebGL crystal scene follows the visitor’s scroll, and Contact posts directly to Formspree.

| | |
|---|---|
| Framework | [Next.js](https://nextjs.org/) 16 App Router, React 19, TypeScript |
| Rendering | Raw WebGL2 point renderer (no Three.js) |
| Motion | [GSAP](https://gsap.com) (ScrollTrigger, SplitText, ScrambleText) and [Lenis](https://lenis.darkroom.engineering) smooth scroll |
| Type | Bricolage Grotesque, Newsreader, JetBrains Mono (self-hosted through Fontsource) |
| Tests | Playwright end-to-end suite with axe accessibility checks |

## Quick start

Use Node.js 20.9 or newer.

```bash
git clone git@github.com:Satyagni/novatom-website.git
cd novatom-website
npm install
npm run dev          # http://127.0.0.1:5173 with hot reload
```

To see the production build instead:

```bash
npm run build        # writes the production build to .next/
npm run preview      # serves the production build at http://127.0.0.1:4173
```

On Windows, `START-WEBSITE.bat` does the install, build and preview in one double-click and opens the browser.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next.js development server on port 5173. Refresh after editing a file in `partials/`. |
| `npm run build` | Next.js production build. All content routes are prerendered. |
| `npm run preview` | Starts the Next.js production server on port 4173. |
| `npm run typecheck` | Checks the TypeScript application. |
| `npm run test:e2e` | Runs the end-to-end suite against the preview server. Build and start the preview first. |

## Which guide to read

| If you want to... | Read |
|---|---|
| Change wording, add a section, edit the nav or footer, add a page | [docs/CONTENT-GUIDE.md](docs/CONTENT-GUIDE.md) |
| Understand how the scene, scroll director and hero fit together before changing motion | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Put the site on a host and point the domain at it | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Run the tests, profile a stutter, or debug on one machine | [docs/TESTING.md](docs/TESTING.md) |
| Submit a change | [CONTRIBUTING.md](CONTRIBUTING.md) |

## Repository layout

```
app/                                           TypeScript routes, metadata, document layout, and 404.
partials/                                      Trusted HTML fragments for the existing motion runtime.
  pages/                                       Assigns section partials to routes.
src/
  main.js                                      Boot, page transitions, smooth scroll, nav.
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
next.config.ts                                 Legacy URL redirects and security headers.
```

## Things worth knowing before you change anything

- **Nothing in the repo is a secret.** The contact form posts to a public Formspree endpoint (the form action in `partials/s-contact.html`). Formspree form IDs are meant to be public. There are no API keys, tokens or `.env` files.
- **Everyone gets the same design.** The OS "reduce motion" setting is deliberately ignored. A device that cannot keep up is handled by a frame-time governor that lowers the point count, not by a different layout. `?motion=reduce` exists only to test the static layout.
- **Debug switches** are query parameters: `?debug` (on-screen stats), `?tier=off|low|mid|high` (force a GPU budget), `?motion=reduce`, `?safe` (no cursor, wipe or smooth scroll). See [docs/TESTING.md](docs/TESTING.md).
- **The homepage wordmark morphs into the NovAtom symbol as you scroll.** Without WebGL or with reduced motion, the wordmark stays static.

## Licence

No open-source licence is attached, so all rights are reserved by default: the source is public to read, not to reuse. Add a `LICENSE` file if you want to allow that.

Third-party packages keep their own licences (Next.js, React, Lenis and the Fontsource packages are MIT or OFL; GSAP is under its own free licence).
