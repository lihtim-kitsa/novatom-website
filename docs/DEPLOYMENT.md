# Deploying the site

Next.js prerenders the content pages. Run the production build on a Next.js-compatible host to serve those pages, the legacy URL redirects, and the custom 404 response.

## Build and preview

```bash
npm ci
npm run build
npm run preview
```

Use Node.js 20.9 or newer. The preview listens at `http://127.0.0.1:4173/`.

## Vercel

Use the Next.js framework preset and the default output directory. If the project still overrides the output directory to `dist` from the Vite deployment, clear the override before redeploying. The build command is `npm run build`.

## Before pointing the domain at it

- **Form.** The contact form posts to the existing Formspree endpoint (`mojoyejy`), the same one the previous site used. Check that submissions still arrive and that the notification address in the Formspree dashboard is the one you want.
- **Partner logos.** The partner logos on the previous live site returned 404, so this version shows the partners as text. Add logos only once you have the files and permission to use them.
- **Redirects.** Routes changed from an earlier draft: `/materials` is now `/nexcon`, `/devices` is now `/kronig`, and `/company` is now `/about`. Add redirects on the host if those URLs were ever shared.
- **Share image and numbers.** Check `public/og.png` and the statistics carried over from the previous site (6 to 10 years, $50M+, 10^8) and make sure each has a source you are happy to cite.
- **Sitemap and robots.** `public/sitemap.xml` and `public/robots.txt` assume the domain `novatomlabs.com`.

## After deploying

Open the live URL on a normal browser profile and on a phone. Append `?debug` to see which GPU budget the browser chose. To run the end-to-end suite against the live site:

```bash
BASE=https://novatomlabs.com node tests/e2e.mjs
```

On Windows PowerShell: `$env:BASE = 'https://novatomlabs.com'; node tests/e2e.mjs`.

`START-WEBSITE.bat` is only for previewing on your own computer.
