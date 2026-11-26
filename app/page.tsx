import { SitePage, pageMetadata } from './site-page';

export const metadata = pageMetadata('home');

export default function Page() {
  return <SitePage name="home" />;
}
