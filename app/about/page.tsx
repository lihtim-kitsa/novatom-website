import { SitePage, pageMetadata } from '../site-page';

export const metadata = pageMetadata('about');

export default function Page() {
  return <SitePage name="about" />;
}
