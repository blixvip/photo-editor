// Drawing primitives shared by every template. Everything here is deterministic
// given a seed so a variant you liked re-renders identically at any size.

export const FONTS = {
  display: '"Arial Black", "Segoe UI Black", Impact, sans-serif',
  impact: 'Impact, "Arial Black", sans-serif',
  mono: 'Consolas, "Cascadia Mono", "Courier New", monospace',
  marker: '"Segoe Print", "Comic Sans MS", "Segoe UI", cursive',
  emoji: '"Segoe UI Emoji", "Apple Color Emoji", sans-serif',
};

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// ---- color ------------------------------------------------------------------
export function hex2rgb(h) {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
export const rgb2hex = (r, g, b) =>
  '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export function shade(hex, amt) { // amt -1..1
  const [r, g, b] = hex2rgb(hex);
  const t = amt < 0 ? 0 : 255, k = Math.abs(amt);
  return rgb2hex(lerp(r, t, k), lerp(g, t, k), lerp(b, t, k));
}
export function alpha(hex, a) {
  const [r, g, b] = hex2rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function luma(hex) {
  const [r, g, b] = hex2rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
export const readable = (bg, dark = '#0a0a0c', light = '#ffffff') => (luma(bg) > 0.55 ? dark : light);

// ---- shapes -----------------------------------------------------------------
export function rrect(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

export function starPath(ctx, cx, cy, spikes, rOuter, rInner, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 ? rInner : rOuter;
    const a = rot - Math.PI / 2 + (i * Math.PI) / spikes;
    const fn = i ? 'lineTo' : 'moveTo';
    ctx[fn](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

export function burstPath(ctx, cx, cy, spikes, rOuter, rInner, rot = 0, jitter = 0, rnd = Math.random) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const base = i % 2 ? rInner : rOuter;
    const r = base * (1 + (jitter ? (rnd() - 0.5) * jitter : 0));
    const a = rot - Math.PI / 2 + (i * Math.PI) / spikes;
    const fn = i ? 'lineTo' : 'moveTo';
    ctx[fn](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

export function sunburst(ctx, cx, cy, R, n, color, rot = 0, duty = 0.5) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i * 2 * Math.PI) / n;
    const a1 = a0 + ((2 * Math.PI) / n) * duty;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function halftone(ctx, W, H, color, step, maxR, fade) {
  ctx.save();
  ctx.fillStyle = color;
  for (let y = step / 2; y < H + step; y += step) {
    for (let x = step / 2; x < W + step; x += step) {
      let r = maxR;
      if (fade) r = maxR * clamp(fade(x / W, y / H), 0, 1);
      if (r <= 0.15) continue;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 7);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function grain(ctx, W, H, a, cell = 2, rnd = Math.random) {
  const n = document.createElement('canvas');
  const s = Math.max(2, Math.ceil(Math.max(W, H) / cell / 8));
  n.width = n.height = s * 8;
  const c = n.getContext('2d');
  const img = c.createImageData(n.width, n.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + rnd() * 135;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'overlay';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(n, 0, 0, W, H);
  ctx.restore();
}

export function scanlines(ctx, W, H, a, period) {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  for (let y = 0; y < H; y += period) ctx.fillRect(0, y, W, Math.max(1, period * 0.42));
  ctx.restore();
}

export function vignette(ctx, W, H, strength = 0.55, color = '#000') {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, alpha(color, 0));
  g.addColorStop(1, alpha(color, strength));
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}

export function glow(ctx, cx, cy, r, color, a = 0.5) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, alpha(color, a));
  g.addColorStop(0.55, alpha(color, a * 0.35));
  g.addColorStop(1, alpha(color, 0));
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); ctx.restore();
}

// ---- gradients --------------------------------------------------------------
export function linGrad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([p, c]) => g.addColorStop(p, c));
  return g;
}

// A convincing metal: alternating dark/bright bands with a hard specular edge.
export function metal(ctx, x0, y0, x1, y1, pal) {
  const c = pal.metal || ['#6b4a00', '#f6d87a', '#fffbe8', '#d9a21c', '#8a5e05', '#ffe9a8', '#7a5300'];
  return linGrad(ctx, x0, y0, x1, y1, c.map((col, i) => [i / (c.length - 1), col]));
}

export function chromeGrad(ctx, y0, y1, pal) {
  const c = pal.chrome || ['#ffffff', '#cfe0f2', '#5d7694', '#22314a', '#8fb0d0', '#ffffff', '#7e93ad'];
  return linGrad(ctx, 0, y0, 0, y1, c.map((col, i) => [i / (c.length - 1), col]));
}

// ---- text -------------------------------------------------------------------
export function fitFont(ctx, text, maxW, family, weight = '900', start = 400, maxH) {
  let lo = 8, hi = start, best = 8;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    ctx.font = `${weight} ${mid}px ${family}`;
    const m = ctx.measureText(text);
    const h = (m.actualBoundingBoxAscent || mid * 0.72) + (m.actualBoundingBoxDescent || mid * 0.2);
    if (m.width <= maxW && (!maxH || h <= maxH)) { best = mid; lo = mid; } else hi = mid;
  }
  ctx.font = `${weight} ${best}px ${family}`;
  return best;
}

// Layered text: outlines drawn outside-in, then fill, with optional emboss.
export function layeredText(ctx, text, x, y, o = {}) {
  ctx.save();
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = o.baseline || 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  for (const l of (o.outlines || [])) {
    ctx.strokeStyle = l.color;
    ctx.lineWidth = l.width;
    if (l.blur) { ctx.shadowColor = l.color; ctx.shadowBlur = l.blur; }
    ctx.strokeText(text, x + (l.dx || 0), y + (l.dy || 0));
    ctx.shadowBlur = 0;
  }
  if (o.emboss) {
    ctx.fillStyle = o.emboss.color;
    ctx.fillText(text, x + o.emboss.dx, y + o.emboss.dy);
  }
  if (o.shadow) { ctx.shadowColor = o.shadow.color; ctx.shadowBlur = o.shadow.blur || 0; ctx.shadowOffsetX = o.shadow.dx || 0; ctx.shadowOffsetY = o.shadow.dy || 0; }
  ctx.fillStyle = o.fill || '#fff';
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Text bent around a circle. spread is total sweep in radians.
export function arcText(ctx, text, cx, cy, r, centerAngle, o = {}) {
  if (!text) return;
  // bottom:true sweeps the other way so legends under a coin stay upright.
  const down = !!o.bottom;
  const chars = [...text];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = o.baseline || 'middle';
  ctx.font = o.font;
  const widths = chars.map(c => ctx.measureText(c).width + (o.track || 0));
  const total = widths.reduce((a, b) => a + b, 0);
  const sweep = total / r;
  const dir = down ? -1 : 1;
  let a = centerAngle - (dir * sweep) / 2;
  for (let i = 0; i < chars.length; i++) {
    const w = widths[i];
    a += (dir * w) / 2 / r;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + (down ? -Math.PI / 2 : Math.PI / 2));
    if (o.outline) { ctx.lineJoin = 'round'; ctx.strokeStyle = o.outline; ctx.lineWidth = o.outlineW || 2; ctx.strokeText(chars[i], 0, 0); }
    ctx.fillStyle = o.fill || '#fff';
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    a += (dir * w) / 2 / r;
  }
  ctx.restore();
}

export function tracked(ctx, text, x, y, track, o = {}) {
  const chars = [...text];
  const w = chars.reduce((s, c) => s + ctx.measureText(c).width + track, 0) - track;
  let cx = o.align === 'left' ? x : x - w / 2;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = o.baseline || 'middle';
  for (const c of chars) {
    if (o.outline) { ctx.lineJoin = 'round'; ctx.strokeStyle = o.outline; ctx.lineWidth = o.outlineW || 2; ctx.strokeText(c, cx, y); }
    ctx.fillStyle = o.fill || '#fff';
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + track;
  }
  ctx.restore();
  return w;
}

// ---- subject (dropped image / emoji) ---------------------------------------
// Rasterize whatever the user gave us into a square canvas so every template
// can treat it the same way and dilate it for sticker outlines.
export function subjectCanvas(S, size) {
  const key = 'sub' + size;
  if (S._cache && S._cache[key]) return S._cache[key];
  let out = null;
  if (S.bitmap) {
    out = document.createElement('canvas');
    out.width = out.height = size;
    const c = out.getContext('2d');
    const b = S.bitmap;
    const k = Math.min(size / b.width, size / b.height);
    const w = b.width * k, h = b.height * k;
    c.drawImage(b, (size - w) / 2, (size - h) / 2, w, h);
  } else if (S.emoji) {
    out = document.createElement('canvas');
    out.width = out.height = size;
    const c = out.getContext('2d');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `${Math.round(size * 0.82)}px ${FONTS.emoji}`;
    c.fillText(S.emoji, size / 2, size * 0.54);
  }
  if (!S._cache) S._cache = {};
  S._cache[key] = out;
  return out;
}

// Dilate alpha into a solid colored ring -> die-cut sticker edge.
export function dilate(src, px, color) {
  const pad = Math.ceil(px) + 2;
  const out = document.createElement('canvas');
  out.width = src.width + pad * 2;
  out.height = src.height + pad * 2;
  const c = out.getContext('2d');
  const steps = 32;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    c.drawImage(src, pad + Math.cos(a) * px, pad + Math.sin(a) * px);
  }
  // also fill the gaps between ring samples at half radius
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2 + Math.PI / steps;
    c.drawImage(src, pad + Math.cos(a) * px * 0.6, pad + Math.sin(a) * px * 0.6);
  }
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, out.width, out.height);
  return { canvas: out, pad };
}

// Draw the subject centered in a box, optionally with a sticker outline.
export function drawSubject(ctx, S, cx, cy, size, o = {}) {
  const src = subjectCanvas(S, Math.max(64, Math.round(size)));
  if (!src) return false;
  const half = size / 2;
  if (o.outline && o.outlineW > 0) {
    const d = dilate(src, (o.outlineW * src.width) / size, o.outline);
    const k = size / src.width;
    ctx.save();
    if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.shadowBlur || size * 0.06; ctx.shadowOffsetY = o.shadowDY ?? size * 0.03; }
    ctx.drawImage(d.canvas, cx - half - d.pad * k, cy - half - d.pad * k, d.canvas.width * k, d.canvas.height * k);
    ctx.restore();
  } else if (o.shadow) {
    ctx.save();
    ctx.shadowColor = o.shadow; ctx.shadowBlur = o.shadowBlur || size * 0.06; ctx.shadowOffsetY = o.shadowDY ?? size * 0.03;
    ctx.drawImage(src, cx - half, cy - half, size, size);
    ctx.restore();
  }
  ctx.drawImage(src, cx - half, cy - half, size, size);
  return true;
}

// Cover-fit the subject into a rect (for pfp / banner backgrounds).
export function drawCover(ctx, bmp, x, y, w, h) {
  const k = Math.max(w / bmp.width, h / bmp.height);
  const dw = bmp.width * k, dh = bmp.height * k;
  ctx.drawImage(bmp, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// ---- background helper ------------------------------------------------------
export function bg(ctx, W, H, S, stops) {
  if (S.transparent) return;
  ctx.fillStyle = linGrad(ctx, 0, 0, W * 0.3, H, stops);
  ctx.fillRect(0, 0, W, H);
}
