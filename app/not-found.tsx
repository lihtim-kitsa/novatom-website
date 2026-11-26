import type { Metadata } from 'next';
import NotFoundScene from './not-found-scene';
import './not-found.css';

export const metadata: Metadata = {
  title: '404 · Page not found | NovAtom Labs',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <>
      <NotFoundScene />
      <a className="missing-brand" href="/" aria-label="NovAtom Labs home">
        <img src="/novatom-titanium.svg" alt="" width={958} height={187} />
      </a>
      <main className="missing">
        <div className="missing-code" aria-hidden="true">404</div>
        <h1>Page not found.</h1>
        <p>The page may have moved, or the link may be out of date.</p>
        <nav aria-label="Recovery links">
          <a className="btn" href="/">Back to home</a>
          <a className="textlink" href="/products">Explore products</a>
        </nav>
      </main>
    </>
  );
}
