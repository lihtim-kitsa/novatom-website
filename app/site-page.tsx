import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { pageDetails, type PageName } from './page-details';
import SiteRuntime from './site-runtime';

const socialImage = 'https://novatomlabs.com/og.png';

export function pageMetadata(name: PageName): Metadata {
  const page = pageDetails[name];
  return {
    title: page.title,
    description: page.description,
    openGraph: {
      type: 'website',
      siteName: 'NovAtom Labs',
      title: page.openGraphTitle,
      description: page.openGraphDescription,
      images: [socialImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.openGraphTitle,
      description: page.openGraphDescription,
      images: [socialImage],
    },
  };
}

function fragment(file: string): string {
  return readFileSync(join(process.cwd(), 'partials', file), 'utf8')
    .replace(/<!--\s*@include\s+([\w./-]+)\s*-->/g, (_, include: string) => fragment(include));
}

const noScriptStyle = '.loop-track,.ledger-track,.space{height:auto!important}.loop-sticky,.ledger-sticky,.space-inner{position:static!important;height:auto!important}.step-body{grid-template-rows:1fr!important}.step{opacity:1!important}#gl,.wipe{display:none!important}';

export function SitePage({ name }: { name: PageName }) {
  // The canvas director and page transitions own this markup after hydration.
  return (
    <div className="site-document" suppressHydrationWarning>
      <noscript><style>{noScriptStyle}</style></noscript>
      <div className="site-fragment" dangerouslySetInnerHTML={{ __html: fragment('chrome.html') }} />
      <div className="site-fragment" dangerouslySetInnerHTML={{
        __html: `<main id="main" data-page="${name}">${fragment(`pages/${name}.html`)}</main>`,
      }} />
      <div className="site-fragment" dangerouslySetInnerHTML={{ __html: fragment('footer.html') }} />
      <SiteRuntime />
    </div>
  );
}
