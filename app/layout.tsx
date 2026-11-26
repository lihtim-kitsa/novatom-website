import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '../src/styles.css';
import '../src/v2.css';
import '../src/editorial.css';

export const metadata: Metadata = {
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#04060b',
};

const startup = `
  const root = document.documentElement;
  const query = new URLSearchParams(location.search);
  root.classList.add('js');
  if (query.get('motion') === 'reduce') root.classList.add('reduced');
  if (location.pathname === '/' && !location.hash &&
      query.get('motion') !== 'reduce' && !query.has('safe') && query.get('tier') !== 'off' &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('startup-loading');
    setTimeout(() => root.classList.remove('startup-loading'), 8000);
  }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `(() => { ${startup} })();` }} /></head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
