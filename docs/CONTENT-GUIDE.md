# Content guide

How to change what the site says and shows, without touching the WebGL code. Read [ARCHITECTURE.md](ARCHITECTURE.md) first only if you want to change motion.

## How a page is put together

Every page is a short HTML file at the repo root. It includes shared fragments from `partials/` with `<!-- @include name.html -->` (a small Vite plugin in `vite.config.js` expands these in dev and in the build, and fragments can include other fragments).

```html
<body data-page="technology">
  <!-- @include chrome.html -->        nav, mobile menu, scroll-dot rail, loader
  <main id="main" data-page="technology">
    <!-- @include s-core.html -->      one section
    <!-- @include s-ledger.html -->
  </main>
  <!-- @include footer.html -->
  <script type="module" src="/src/main.js"></script>
</body>
```

Which fragment holds which text:

| Page | URL | Section partials |
|---|---|---|
| `index.html` | `/` | `s-hero`, `s-space`, `s-loop`, `s-explore` |
| `technology.html` | `/technology` | `s-core`, `s-ledger` |
| `products.html` | `/products` | `s-products` (hero and catalog) |
| `nexcon.html` | `/nexcon` | `s-nexcon`, `s-inverse` |
| `kronig.html` | `/kronig` | `s-kronig` |
| `about.html` | `/about` | `s-company-hero`, `s-whynow`, `s-model`, `s-team` |
| `contact.html` | `/contact` | `s-contact` |

Shared by all pages: `head.html` (meta, social image, early scripts), `chrome.html` (nav), `footer.html`.

## Everyday edits

**Change wording.** Edit the text in the partial. Partials are plain HTML, so there is nothing to compile. In dev, saving a partial reloads the page.

**Change a page title or description.** These live in the page file itself (`<title>`, `meta name="description"`, `og:title`, `og:description`), not in a partial, so each page can differ. Keep the description under about 160 characters.

**Change the social-share image.** Replace `public/og.png` (1200 x 630). `tests/diagnostics/og.mjs` renders the home scene to that size if you want to regenerate it. The URL is set in `partials/head.html`.

**Change the nav.** Edit `partials/chrome.html`. The links appear twice, in the desktop header and in the mobile menu, so change both. The active link is highlighted automatically from the current URL.

**Change the footer.** Edit `partials/footer.html`.

**Animated headings.** Put `data-split` on a heading to get the masked line-rise on scroll. Add `data-react` as well (on `.display` headings) to make the letters react to the pointer.

**The contact form.** Its Formspree endpoint is the form's `action` in `partials/s-contact.html`. Validation and status messages are in `initForm` in `src/pages.js`. The hidden `_gotcha` field is a honeypot. Review `privacy.html` whenever the data collected or the submission provider changes.

## Scroll dots (the rail on the right)

The rail is built from the sections on the current page. A section gets a dot when it has `data-rail="Label"` and an `id`:

```html
<section class="explore" id="explore" data-rail="Explore" ...>
```

- With fewer than two such sections the rail is hidden (Kronig and Contact have one section each, so they have no dots).
- Clicking a dot scrolls to the top of that section by default.
- `data-land="0.5"` makes the dot land part-way through the section instead. The number is a fraction of the section's scroll range. Use it for tall, scroll-driven sections whose finished state appears after the top: the top of `s-space` is an empty first frame, so it uses `0.82`; `s-ledger` uses `0.9`, `s-inverse` and `s-team` use `0.4`, `s-explore` uses `0.5`.
- After adding or resizing a section, click its dot and look at what is on screen. If content is cut off or not yet visible, adjust `data-land`. `tests/diagnostics/alldots.mjs` clicks every dot on every page and saves screenshots.

## What the crystal does on each section: `data-pose`

On every page except the home sequence, the background scene is described by a `data-pose` attribute on each section. The scroll director blends between the poses of neighbouring sections.

```html
<section ... data-pose="st:5;op:1;ox:3.4;sc:1.3;rp:.4;du:.7;cl:-1 -1 -.08 1;ck:.9">
```

| Key | Meaning |
|---|---|
| `st` | Scene state: 0 cloud, 1 search-space box, 2 clusters, 3 funnel, 4 sorted points (reject / uncertain / confident), 5 crystal lattice, 6 orbits, 7 wordmark |
| `op` | Opacity of the scene, 0 to 1 |
| `ox`, `oy` | Horizontal and vertical offset |
| `sc` | Scale |
| `rp` | Ripple strength (the sonar-style phonon ripples) |
| `du` | Dust amount |
| `cl` | A rectangle `x0 y0 x1 y1` (in screen fractions, -1 to 1) where points fade out so text stays readable |
| `ck` | How strongly points fade inside that rectangle, 0 to 1 |

`data-at` / `data-pose2` give a section a second pose part-way down it (see `s-kronig.html`). Missing keys fall back to the defaults at the top of `src/director.js`.

The home page is different: its camera story (hero, dive into the lattice, the loop, explore) is scripted in `director.js`, so editing `data-pose` on home sections does nothing.

## Adding a page

1. Copy a small existing page (`kronig.html`) to `<name>.html` and edit the title, description and `data-page`.
2. Add a partial `partials/s-<name>.html` with at least one `<section id data-rail data-pose>`, and include it from the new page.
3. Register the page in two places: the `pages` array in `vite.config.js` (so it is built) and the `PAGES` set in `src/main.js` (so in-site navigation uses the page transition instead of a full load).
4. Add the link to `partials/chrome.html` (header and mobile menu) and, if relevant, the footer.
5. Add the URL to `public/sitemap.xml`.
6. Add the route to the `ROUTES` list in `tests/audit.mjs` and to the page list in `tests/e2e.mjs`.
7. If the page replaces an old URL that was ever shared, add a redirect on the host (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## Writing style

The site is read by researchers, partners and investors. Keep copy plain and specific:

- State what the system does and what has been measured. Do not use superlatives, "revolutionary", "seamless", "unlock", or stacked adjectives.
- Prefer one concrete number with its source over three vague claims.
- Do not add a claim, a name or a partner logo that has not been confirmed by the team. The statistics carried over from the old site (6 to 10 years, $50M+, 10^8) should have sources you are happy to cite.
- Em dashes and rhetorical questions are a common tell of filler copy; use them sparingly.
