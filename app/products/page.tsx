import { SitePage, pageMetadata } from '../site-page';

export const metadata = pageMetadata('products');

export default function Page() {
  return <SitePage name="products" />;
}
