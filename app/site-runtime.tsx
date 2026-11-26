'use client';

import { useEffect } from 'react';

export default function SiteRuntime() {
  useEffect(() => {
    void import('../src/main.js').catch(error => {
      document.documentElement.classList.remove('startup-loading');
      console.error('Unable to initialize NovAtom interactions.', error);
    });
  }, []);
  return null;
}
