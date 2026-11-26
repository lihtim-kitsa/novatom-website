/**
 * Rasterises "NovAtom Labs" (Nov 500, Atom 700, Labs 400, the brand weights) in the page font and returns one
 * target position per field point, so the crystal's own atoms can spell the name before they become the crystal.
 * Coordinates are in scene units, centred on the origin, `width` units wide.
 */
export function buildWordmark(count, { width = 11.5, text, image } = {}) {
  const W = 1400, H = 280, size = 150;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff';
  if (image) {
    const scale = Math.min(W / image.naturalWidth, H / image.naturalHeight);
    x.drawImage(image, 0, 0, image.naturalWidth * scale, image.naturalHeight * scale);
  } else {
    const parts = text ? [[text, 800]] : [['Nov', 500], ['Atom', 700], [' Labs', 400]];
    const font = (w) => `${w} ${size}px "Bricolage Grotesque Variable", "Helvetica Neue", Arial, sans-serif`;
    let total = 0;
    parts.forEach(([t, w]) => { x.font = font(w); total += x.measureText(t).width; });
    let px = (W - total) / 2;
    parts.forEach(([t, w]) => { x.font = font(w); x.fillText(t, px, H * 0.68); px += x.measureText(t).width; });
  }

  const data = x.getImageData(0, 0, W, H).data;
  const xs = [], ys = [];
  let minX = W, maxX = 0, minY = H, maxY = 0;
  for (let yy = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++) {
      if (data[(yy * W + xx) * 4 + 3] > 128) {
        xs.push(xx); ys.push(yy);
        if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy; if (yy > maxY) maxY = yy;
      }
    }
  }
  const out = new Float32Array(count * 3);
  const n = xs.length;
  if (!n) return out;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, k = width / Math.max(1, maxX - minX);
  for (let i = 0; i < count; i++) {
    const j = (Math.random() * n) | 0;
    out[i * 3] = (xs[j] + Math.random() - 0.5 - cx) * k;
    out[i * 3 + 1] = -(ys[j] + Math.random() - 0.5 - cy) * k;
    out[i * 3 + 2] = (Math.random() - 0.5) * 0.22;
  }
  return out;
}
