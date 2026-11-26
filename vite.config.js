import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const pages = ['index', 'technology', 'products', 'nexcon', 'kronig', 'about', 'contact', 'privacy', '404'];

/** <!-- @include name.html --> pulls a file from /partials, recursively, in dev and build. */
function includes() {
  const expand = (html) => html.replace(/<!--\s*@include\s+([\w./-]+)\s*-->/g, (_, f) => expand(fs.readFileSync(path.join(root, 'partials', f), 'utf8')));
  return {
    name: 'html-includes',
    handleHotUpdate({ file, server }) { if (file.includes(`${path.sep}partials${path.sep}`)) server.ws.send({ type: 'full-reload' }); },
    transformIndexHtml: { order: 'pre', handler: expand },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [includes()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p, path.join(root, `${p}.html`)])),
      output: { manualChunks(id) { if (id.includes('node_modules/gsap')) return 'gsap'; } },
    },
  },
  server: { host: '127.0.0.1', port: 5173 },
});
