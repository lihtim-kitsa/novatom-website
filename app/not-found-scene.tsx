'use client';

import { useEffect, useRef } from 'react';

export default function NotFoundScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const code = document.querySelector<HTMLElement>('.missing-code');
    if (!canvas || !code || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let unmounted = false;
    void import('../src/scene/not-found.js')
      .then(({ mountNotFoundScene }) => {
        if (!unmounted) return mountNotFoundScene(canvas, code);
      })
      .catch(() => {});
    return () => { unmounted = true; };
  }, []);

  return <canvas ref={canvasRef} id="missing-scene" aria-hidden="true" />;
}
