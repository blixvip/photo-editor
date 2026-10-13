import {
  FONTS, clamp, lerp, alpha, shade, luma, readable, rrect, starPath, burstPath, sunburst,
  halftone, grain, scanlines, vignette, glow, linGrad, metal, chromeGrad, fitFont,
  layeredText, arcText, tracked, subjectCanvas, drawSubject, drawCover, bg, mulberry32, hashStr,
} from './gfx.js';

// ---- palettes ---------------------------------------------------------------
const autoMetal = a => [shade(a, -0.78), shade(a, 0.12), shade(a, 0.72), a, shade(a, -0.5), shade(a, 0.55), shade(a, -0.7)];

export const PALETTES = [
  { id: 'solana', name: 'Solana', bg: [[0, '#140b2e'], [1, '#06070f']], ink: '#ffffff', accent: '#14F195', accent2: '#9945FF' },
  { id: 'doge', name: 'Doge Gold', bg: [[0, '#f6c944'], [1, '#b8761a']], ink: '#2a1600', accent: '#ffe071', accent2: '#8a4b00',
    metal: ['#6b4a00', '#f6d87a', '#fffbe8', '#d9a21c', '#8a5e05', '#ffe9a8', '#7a5300'] },
  { id: 'pepe', name: 'Pepe', bg: [[0, '#0d3317'], [1, '#04140a']], ink: '#eafff0', accent: '#45e04f', accent2: '#c9ff4d' },
  { id: 'bonk', name: 'Bonk', bg: [[0, '#2e1500'], [1, '#100600']], ink: '#fff3e0', accent: '#ff8a00', accent2: '#ffd400' },
  { id: 'noir', name: 'Chrome Noir', bg: [[0, '#191b21'], [1, '#07080b']], ink: '#ffffff', accent: '#cfe0f5', accent2: '#5f7fa8' },
  { id: 'hyper', name: 'Hyper Teal', bg: [[0, '#06262a'], [1, '#021214']], ink: '#eafffe', accent: '#22e0d0', accent2: '#0aa3ff' },
  { id: 'gum', name: 'Bubblegum', bg: [[0, '#ff93d2'], [1, '#e8278c']], ink: '#3a0220', accent: '#fff2fb', accent2: '#7a1050' },
  { id: 'acid', name: 'Acid', bg: [[0, '#1b1b20'], [1, '#09090b']], ink: '#f6ffd9', accent: '#d4ff00', accent2: '#00e5ff' },
  { id: 'blood', name: 'Blood', bg: [[0, '#2b0509'], [1, '#0d0103']], ink: '#ffeaec', accent: '#ff2d4a', accent2: '#ff9a3d' },
  { id: 'cream', name: 'Cream Retro', bg: [[0, '#f8eed6'], [1, '#e6cfa2']], ink: '#2b1a08', accent: '#e2572b', accent2: '#2f6b4f' },
  { id: 'vapor', name: 'Vapor', bg: [[0, '#3a1263'], [1, '#07213f']], ink: '#ffffff', accent: '#ff6ec7', accent2: '#42e8ff' },
  { id: 'bullion', name: 'Bullion', bg: [[0, '#121008'], [1, '#040404']], ink: '#fff6dd', accent: '#ffcc33', accent2: '#8a6a12' },
];
for (const p of PALETTES) { if (!p.metal) p.metal = autoMetal(p.accent); }

// ---- layout -----------------------------------------------------------------
function layout(S) {
  const { W, H } = S;
  const wide = W / H > 1.5;
  if (wide) {
    return { wide, mcx: W * 0.195, mcy: H * 0.5, msize: H * 0.78,
      tcx: W * 0.395 + (W * 0.56) / 2, tcy: H * 0.5, tx: W * 0.395, tw: W * 0.56 };
  }
  const hasMark = !!(S.bitmap || S.emoji);
  return { wide, mcx: W / 2, mcy: hasMark ? H * 0.43 : H * 0.5, msize: Math.min(W, H) * 0.54,
    tcx: W / 2, tcy: hasMark ? H * 0.845 : H * 0.5, tx: W * 0.07, tw: W * 0.86 };
}
const tick = S => '$' + S.ticker;

// ---- 1. coin ----------------------------------------------------------------
function coin(ctx, S) {
  const { W, H, pal, rnd } = S;
  const L = layout(S);
  if (!S.transparent) {
    ctx.fillStyle = linGrad(ctx, 0, 0, W * 0.4, H, pal.bg);
    ctx.fillRect(0, 0, W, H);
    glow(ctx, L.mcx, L.mcy, Math.min(W, H) * 0.62, pal.accent, 0.28);
  }
  const R = (L.wide ? H : Math.min(W, H)) * (L.wide ? 0.42 : 0.4);
  const cx = L.wide ? L.mcx : W / 2, cy = L.wide ? L.mcy : H / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = R * 0.2; ctx.shadowOffsetY = R * 0.06;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7);
  ctx.fillStyle = metal(ctx, cx - R, cy - R, cx + R, cy + R, pal);
  ctx.fill();
  ctx.restore();

  // reeded edge
  const reeds = 60 + Math.floor(rnd() * 5) * 18;
  ctx.save();
  ctx.strokeStyle = alpha(shade(pal.metal[0], -0.2), 0.55);
  ctx.lineWidth = R * 0.012;
  for (let i = 0; i < reeds; i++) {
    const a = (i / reeds) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.995, cy + Math.sin(a) * R * 0.995);
    ctx.lineTo(cx + Math.cos(a) * R * 0.93, cy + Math.sin(a) * R * 0.93);
    ctx.stroke();
  }
  ctx.restore();

  // raised rim + inner face
  ctx.lineWidth = R * 0.055;
  ctx.strokeStyle = metal(ctx, cx + R, cy - R, cx - R, cy + R, pal);
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, 0, 7);
  ctx.fillStyle = metal(ctx, cx - R, cy + R, cx + R, cy - R, pal);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = R * 0.016;
  ctx.strokeStyle = shade(pal.metal[0], -0.3);
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, 0, 7); ctx.stroke();
  if (rnd() > 0.5) { // beaded inner ring
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = shade(pal.metal[0], -0.25);
    const beads = 36 + Math.floor(rnd() * 3) * 12;
    for (let i = 0; i < beads; i++) {
      const a = (i / beads) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * R * 0.76, cy + Math.sin(a) * R * 0.76, R * 0.011, 0, 7);
      ctx.fill();
    }
  }
  ctx.restore();

  const hasMark = drawSubject(ctx, S, cx, cy - R * 0.06, R * 0.86, { shadow: alpha(shade(pal.metal[0], -0.5), 0.5), shadowBlur: R * 0.08, shadowDY: R * 0.02 });
  if (!hasMark) {
    const t = S.ticker || 'MEME';
    fitFont(ctx, t, R * 1.22, FONTS.display, '900', R * 1.1);
    layeredText(ctx, t, cx, cy, {
      fill: metal(ctx, 0, cy - R * 0.5, 0, cy + R * 0.5, pal),
      outlines: [{ color: alpha(shade(pal.metal[0], -0.4), 0.9), width: R * 0.035 }],
      emboss: { color: alpha('#ffffff', 0.5), dx: 0, dy: -R * 0.016 },
    });
  }

  // arc legends
  const rim = shade(pal.metal[0], -0.12);
  const legend = (S.name || S.ticker || '').toUpperCase();
  if (hasMark && legend) {
    ctx.font = `900 ${R * 0.1}px ${FONTS.display}`;
    arcText(ctx, legend.slice(0, 26), cx, cy, R * 0.865, -Math.PI / 2, { font: ctx.font, fill: rim, track: R * 0.012 });
  }
  const bottom = hasMark ? tick(S) : (S.tagline || '').toUpperCase().slice(0, 22);
  if (bottom) {
    ctx.font = `900 ${R * 0.1}px ${FONTS.display}`;
    arcText(ctx, bottom, cx, cy, R * 0.865, Math.PI / 2, { font: ctx.font, fill: rim, bottom: true, track: R * 0.01 });
  }

  // specular sweep
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
  ctx.globalCompositeOperation = 'screen';
  const ga = -2.6 + rnd() * 1.4; // specular sweep direction
  ctx.fillStyle = linGrad(ctx, cx + Math.cos(ga) * R, cy + Math.sin(ga) * R,
    cx - Math.cos(ga) * R * 0.5, cy - Math.sin(ga) * R * 0.5,
    [[0, 'rgba(255,255,255,.42)'], [0.42, 'rgba(255,255,255,.06)'], [0.55, 'rgba(255,255,255,0)']]);
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();

  if (L.wide) wideText(ctx, S, L);
}

// ---- 2. liquid chrome -------------------------------------------------------
function chrome(ctx, S) {
  const { W, H, pal, rnd } = S;
  if (!S.transparent) {
    ctx.fillStyle = linGrad(ctx, 0, 0, 0, H, [[0, shade(pal.bg[0][1], 0.08)], [1, pal.bg[1][1]]]);
    ctx.fillRect(0, 0, W, H);
    glow(ctx, W / 2, H * 0.46, Math.max(W, H) * 0.6, pal.accent, 0.3);
    halftone(ctx, W, H, alpha(pal.accent, 0.08), Math.min(W, H) / 26, Math.min(W, H) / 150);
  }
  const hasMark = !!(S.bitmap || S.emoji);
  const t = (S.ticker || 'MEME').toUpperCase();
  const cy = hasMark ? H * 0.72 : H * 0.5;
  if (hasMark) drawSubject(ctx, S, W / 2, H * 0.33, Math.min(W, H) * 0.44, { shadow: alpha(pal.accent, 0.6), shadowBlur: Math.min(W, H) * 0.08, shadowDY: 0 });

  const maxW = W * 0.86, maxH = hasMark ? H * 0.3 : H * 0.44;
  const size = fitFont(ctx, t, maxW, FONTS.display, '900', Math.min(W, H) * 0.6, maxH);
  ctx.save();
  ctx.translate(W / 2, cy);
  ctx.transform(1, 0, -0.03 - rnd() * 0.15, 1.01 + rnd() * 0.1, 0, 0); // lean + stretch
  layeredText(ctx, t, 0, 0, {
    fill: chromeGrad(ctx, -size * 0.5, size * 0.5, pal),
    outlines: [
      { color: alpha(pal.accent, 0.75), width: size * 0.13, blur: size * 0.22 },
      { color: '#05070c', width: size * 0.075 },
      { color: alpha('#ffffff', 0.85), width: size * 0.018 },
    ],
  });
  // hard specular band across the glyphs
  ctx.save();
  ctx.font = `900 ${size}px ${FONTS.display}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const band = -size * (0.08 + rnd() * 0.16);
  ctx.beginPath(); ctx.rect(-maxW, band, maxW * 2, size * (0.08 + rnd() * 0.07)); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.fillText(t, 0, 0);
  ctx.restore();
  ctx.restore();

  const sub = (S.tagline || S.name || '').toUpperCase();
  if (sub) {
    ctx.font = `700 ${Math.min(W, H) * 0.036}px ${FONTS.mono}`;
    tracked(ctx, sub.slice(0, 40), W / 2, cy + size * 0.56, Math.min(W, H) * 0.012, { fill: alpha(pal.ink, 0.72) });
  }
}

// ---- 3. die-cut sticker -----------------------------------------------------
function sticker(ctx, S) {
  const { W, H, pal, rnd } = S;
  const L = layout(S);
  if (!S.transparent) {
    ctx.fillStyle = pal.accent;
    ctx.fillRect(0, 0, W, H);
    halftone(ctx, W, H, alpha(shade(pal.accent, -0.35), 0.55), Math.min(W, H) / 20, Math.min(W, H) / 85);
    ctx.fillStyle = linGrad(ctx, 0, 0, W, H, [[0, alpha('#ffffff', 0.18)], [1, alpha(shade(pal.accent, -0.45), 0.35)]]);
    ctx.fillRect(0, 0, W, H);
  }
  const ink = readable(S.transparent ? '#ffffff' : pal.accent);
  const edge = '#ffffff';
  const got = drawSubject(ctx, S, L.mcx, L.mcy - (L.wide ? 0 : H * 0.03), L.msize * 1.08, {
    outline: edge, outlineW: Math.min(W, H) * 0.028, shadow: 'rgba(0,0,0,.42)',
    shadowBlur: Math.min(W, H) * 0.05, shadowDY: Math.min(W, H) * 0.022,
  });
  if (!got) {
    const r = Math.min(W, H) * 0.3;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = r * 0.2; ctx.shadowOffsetY = r * 0.08;
    burstPath(ctx, L.mcx, L.mcy, 14, r, r * 0.72, rnd() * 3, 0.07, rnd);
    ctx.fillStyle = edge; ctx.fill();
    ctx.restore();
    burstPath(ctx, L.mcx, L.mcy, 14, r * 0.93, r * 0.67, 0.0, 0.05, rnd);
    ctx.fillStyle = pal.accent2; ctx.fill();
    const t = (S.ticker || 'MEME');
    fitFont(ctx, t, r * 1.3, FONTS.impact, '900', r);
    layeredText(ctx, t, L.mcx, L.mcy, { fill: edge, outlines: [{ color: '#0a0a0c', width: r * 0.06 }] });
  }

  // ribbon
  const t = tick(S);
  const rw = Math.min(W * (L.wide ? 0.5 : 0.84), W * 0.9);
  const size = fitFont(ctx, t, rw * 0.84, FONTS.impact, '900', Math.min(W, H) * 0.24, Math.min(W, H) * 0.17);
  const rh = size * 1.34;
  const bx = L.wide ? L.tx : (W - rw) / 2;
  const by = L.wide ? H * 0.5 - rh / 2 : H * 0.79 - rh / 2;
  ctx.save();
  ctx.translate(bx + rw / 2, by + rh / 2);
  ctx.rotate(L.wide ? 0 : (rnd() - 0.5) * 0.07);
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = rh * 0.25; ctx.shadowOffsetY = rh * 0.1;
  rrect(ctx, -rw / 2, -rh / 2, rw, rh, rh * 0.26);
  ctx.fillStyle = '#0a0a0c'; ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.lineWidth = rh * 0.07; ctx.strokeStyle = edge; ctx.stroke();
  ctx.font = `900 ${size}px ${FONTS.impact}`;
  layeredText(ctx, t, 0, 0, { fill: edge, outlines: [] });
  ctx.restore();

  if (L.wide && S.name) {
    ctx.font = `900 ${H * 0.1}px ${FONTS.display}`;
    tracked(ctx, S.name.toUpperCase().slice(0, 24), L.tx, by + rh + H * 0.12, H * 0.004, { fill: ink, align: 'left' });
  }
}

// ---- 4. neon pfp ------------------------------------------------------------
function pfpring(ctx, S) {
  const { W, H, pal, rnd } = S;
  const R = Math.min(W, H) * 0.46;
  const cx = W / 2, cy = H / 2;
  if (!S.transparent) {
    ctx.fillStyle = linGrad(ctx, 0, 0, W, H, pal.bg);
    ctx.fillRect(0, 0, W, H);
  }
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, 0, 7); ctx.clip();
  if (S.bitmap) {
    drawCover(ctx, S.bitmap, cx - R, cy - R, R * 2, R * 2);
  } else {
    ctx.fillStyle = linGrad(ctx, cx - R, cy - R, cx + R, cy + R, [[0, shade(pal.accent, -0.3)], [1, shade(pal.accent2 || pal.accent, -0.55)]]);
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    sunburst(ctx, cx, cy, R, 12 + Math.floor(rnd() * 5) * 6, alpha('#ffffff', 0.07), rnd() * 1.2);
    if (S.emoji) drawSubject(ctx, S, cx, cy, R * 1.3, {});
    else {
      const t = S.ticker || 'MEME';
      fitFont(ctx, t, R * 1.3, FONTS.display, '900', R);
      layeredText(ctx, t, cx, cy, { fill: '#fff', outlines: [{ color: alpha('#000', 0.5), width: R * 0.03 }] });
    }
  }
  ctx.fillStyle = linGrad(ctx, 0, cy - R, 0, cy + R, [[0, alpha('#000', 0)], [1, alpha('#000', 0.55)]]);
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();

  // double neon ring
  ctx.save();
  ctx.shadowColor = pal.accent; ctx.shadowBlur = R * (0.14 + rnd() * 0.12);
  ctx.lineWidth = R * (0.04 + rnd() * 0.03);
  ctx.strokeStyle = pal.accent;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.925, 0, 7); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = R * 0.016;
  ctx.strokeStyle = alpha(pal.accent2 || '#fff', 0.9);
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.985, 0, 7); ctx.stroke();
  ctx.restore();

  const t = tick(S);
  ctx.font = `900 ${R * 0.17 * Math.min(1, 9 / Math.max(7, t.length))}px ${FONTS.display}`;
  arcText(ctx, t, cx, cy, R * 0.75, Math.PI / 2, { font: ctx.font, fill: '#fff', bottom: true, outline: alpha('#000', 0.55), outlineW: R * 0.012, track: R * 0.01 });
  if (S.name) {
    ctx.font = `900 ${R * 0.09}px ${FONTS.display}`;
    arcText(ctx, S.name.toUpperCase().slice(0, 26), cx, cy, R * 0.78, -Math.PI / 2, { font: ctx.font, fill: alpha('#fff', 0.85), track: R * 0.01 });
  }
}

// ---- 5. pixel retro ---------------------------------------------------------
function pixel(ctx, S) {
  const { W, H, pal, rnd } = S;
  const L = layout(S);
  const px = Math.max(3, Math.round(Math.min(W, H) / 64));
  if (!S.transparent) {
    ctx.fillStyle = pal.bg[1][1];
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = alpha(pal.accent, 0.07 + rnd() * 0.06);
    const cell = px * (1 + Math.floor(rnd() * 3));
    for (let y = 0; y < H; y += cell) for (let x = ((y / cell) % 2) * cell; x < W; x += cell * 2) ctx.fillRect(x, y, cell, cell);
  }
  const src = subjectCanvas(S, 512);
  if (src) {
    const small = document.createElement('canvas');
    const n = 28 + Math.floor(rnd() * 4) * 8;
    small.width = small.height = n;
    const c = small.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.drawImage(src, 0, 0, n, n);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const sz = L.msize;
    ctx.drawImage(small, L.mcx - sz / 2, L.mcy - sz / 2, sz, sz);
    ctx.restore();
  }
  // nearest-neighbour pixel text: render small at the text's own aspect ratio,
  // then scale up hard so short tickers do not get stretched wide.
  const t = (S.ticker || 'MEME').toUpperCase();
  const cellH = 48;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `700 ${cellH * 0.78}px ${FONTS.mono}`;
  const natW = Math.max(16, Math.ceil(probe.measureText(t).width) + 10);
  const small = document.createElement('canvas');
  small.width = natW; small.height = cellH;
  const c2 = small.getContext('2d');
  c2.font = `700 ${cellH * 0.78}px ${FONTS.mono}`;
  c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.fillStyle = '#fff';
  c2.fillText(t, natW / 2, cellH / 2);

  const maxW = L.wide ? L.tw : W * 0.86;
  const maxH = L.wide ? H * 0.3 : Math.min(W, H) * (src ? 0.19 : 0.26);
  let tw = maxW, th = (tw * cellH) / natW;
  if (th > maxH) { th = maxH; tw = (th * natW) / cellH; }
  const tyc = L.wide ? H * 0.42 : (src ? H * 0.82 : H * 0.5);
  const tx = L.wide ? L.tx : (W - tw) / 2;
  const tint = (col) => {
    const cv = document.createElement('canvas');
    cv.width = natW; cv.height = cellH;
    const c = cv.getContext('2d');
    c.drawImage(small, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = col;
    c.fillRect(0, 0, natW, cellH);
    return cv;
  };
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const sh = Math.max(2, th * (0.045 + rnd() * 0.05)), sdx = rnd() > 0.5 ? sh : -sh;
  ctx.drawImage(tint(pal.accent2 || pal.accent), tx + sdx, tyc - th / 2 + sh, tw, th);
  ctx.drawImage(tint(pal.accent), tx, tyc - th / 2, tw, th);
  ctx.restore();

  if (!S.transparent) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    for (let y = 0; y < H; y += px) ctx.fillRect(0, y, W, 1);
    for (let x = 0; x < W; x += px) ctx.fillRect(x, 0, 1, H);
    ctx.restore();
  }
}

// ---- 6. comic pop -----------------------------------------------------------
function comic(ctx, S) {
  const { W, H, pal, rnd } = S;
  const L = layout(S);
  if (!S.transparent) {
    ctx.fillStyle = shade(pal.accent, 0.55);
    ctx.fillRect(0, 0, W, H);
    sunburst(ctx, L.mcx, L.mcy, Math.max(W, H) * 1.2, 24, alpha(pal.accent, 0.85), rnd() * 0.3);
    halftone(ctx, W, H, alpha(shade(pal.accent, -0.5), 0.5), Math.min(W, H) / 22, Math.min(W, H) / 70,
      (x, y) => 1 - Math.hypot(x - 0.5, y - 0.5) * 1.5);
  }
  const got = drawSubject(ctx, S, L.mcx, L.mcy, L.msize, { outline: '#0a0a0c', outlineW: Math.min(W, H) * 0.016 });
  if (!got) {
    const r = Math.min(W, H) * 0.28;
    starPath(ctx, L.mcx, L.mcy, 10, r, r * 0.55, rnd());
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = r * 0.07; ctx.strokeStyle = '#0a0a0c'; ctx.stroke();
  }
  const t = tick(S);
  // the outline stack adds ~26% of the font size on every edge: budget for it
  const size = fitFont(ctx, t, (L.wide ? L.tw : W * 0.88) * 0.76, FONTS.impact, '900',
    L.wide ? H * 0.42 : Math.min(W, H) * 0.26, L.wide ? H * 0.3 : Math.min(W, H) * 0.17);
  const ty = L.wide ? H * 0.42 : H * 0.78;
  ctx.save();
  ctx.translate(L.wide ? L.tcx : W / 2, ty);
  ctx.rotate((rnd() - 0.5) * 0.08);
  ctx.transform(1, 0, -0.14, 1, 0, 0);
  ctx.font = `900 ${size}px ${FONTS.impact}`;
  layeredText(ctx, t, 0, 0, {
    fill: '#ffffff',
    outlines: [
      { color: '#0a0a0c', width: size * 0.26 },
      { color: pal.accent2 || pal.accent, width: size * 0.17 },
      { color: '#0a0a0c', width: size * 0.07 },
    ],
    emboss: { color: '#0a0a0c', dx: size * 0.03, dy: size * 0.035 },
  });
  ctx.restore();
  const ny = ty + size * 0.72;
  if (S.name && ny < H * 0.96) {
    ctx.font = `900 ${Math.min(W, H) * 0.042}px ${FONTS.display}`;
    tracked(ctx, S.name.toUpperCase().slice(0, 30), L.wide ? L.tcx : W / 2, ny, Math.min(W, H) * 0.008, { fill: '#0a0a0c' });
  }
}

// ---- 7. VHS / CRT -----------------------------------------------------------
function crt(ctx, S) {
  const { W, H, pal, rnd } = S;
  const hasMark = !!(S.bitmap || S.emoji);
  if (!S.transparent) {
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, W, H);
    glow(ctx, W / 2, H * 0.5, Math.max(W, H) * 0.7, pal.accent, 0.22);
  }
  const wide = W / H > 1.5;
  if (hasMark) drawSubject(ctx, S, wide ? W * 0.19 : W / 2, wide ? H * 0.5 : H * 0.36, Math.min(W, H) * (wide ? 0.62 : 0.46), {});
  const t = (S.ticker || 'MEME').toUpperCase();
  const tcx = wide ? W * 0.62 : W / 2;
  const cy = hasMark && !wide ? H * 0.76 : H * 0.5;
  const size = fitFont(ctx, t, wide ? W * 0.62 : W * 0.84, FONTS.display, '900', Math.min(W, H) * 0.5, H * 0.34);
  const off = size * 0.035;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.font = `900 ${size}px ${FONTS.display}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff1a4b'; ctx.fillText(t, tcx - off, cy);
  ctx.fillStyle = '#19ffd1'; ctx.fillText(t, tcx + off, cy);
  ctx.fillStyle = alpha('#ffffff', 0.92); ctx.fillText(t, tcx, cy);
  ctx.restore();

  // tracking glitch slices
  if (!S.transparent) {
    for (let i = 0; i < 7; i++) {
      const y = rnd() * H, h = Math.min(W, H) * (0.006 + rnd() * 0.02);
      const dx = (rnd() - 0.5) * W * 0.06;
      ctx.drawImage(ctx.canvas, 0, y, W, h, dx, y, W, h);
    }
    scanlines(ctx, W, H, 0.3, Math.max(2, Math.round(Math.min(W, H) / 220)));
    grain(ctx, W, H, 0.14, 2, rnd);
    vignette(ctx, W, H, 0.65);
  }
  ctx.font = `700 ${Math.min(W, H) * 0.032}px ${FONTS.mono}`;
  const label = (S.tagline || S.name || 'REC').toUpperCase().slice(0, 34);
  tracked(ctx, label, W * 0.06, H * 0.08, Math.min(W, H) * 0.008, { fill: alpha(pal.accent, 0.9), align: 'left' });
  tracked(ctx, 'PLAY  >', W * 0.06, H * 0.93, Math.min(W, H) * 0.008, { fill: alpha('#ffffff', 0.75), align: 'left' });
}

// ---- 8. marker sign ---------------------------------------------------------
function sign(ctx, S) {
  const { W, H, rnd, pal } = S;
  if (!S.transparent) {
    ctx.fillStyle = linGrad(ctx, 0, 0, W, H, [[0, '#d7b68a'], [0.5, '#c9a271'], [1, '#b08a5c']]);
    ctx.fillRect(0, 0, W, H);
    grain(ctx, W, H, 0.4, 1.3, rnd);
    // corrugation
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#5a3c1c';
    for (let x = 0; x < W; x += Math.min(W, H) * 0.035) ctx.fillRect(x, 0, Math.min(W, H) * 0.012, H);
    ctx.restore();
    vignette(ctx, W, H, 0.35, '#3a2208');
  }
  const ink = '#141008';
  const lines = [tick(S), (S.name || '').toUpperCase().slice(0, 24), (S.tagline || '').toUpperCase().slice(0, 26)].filter(Boolean);
  const hasMark = !!(S.bitmap || S.emoji);
  if (hasMark) drawSubject(ctx, S, W * 0.5, H * 0.3, Math.min(W, H) * 0.34, {});
  const top = hasMark ? H * 0.56 : H * 0.28;
  const avail = H * 0.92 - top;
  const lh = avail / lines.length;
  lines.forEach((ln, i) => {
    const size = fitFont(ctx, ln, W * 0.84, FONTS.marker, i === 0 ? '900' : '700', lh * 1.1, lh * 0.82);
    ctx.save();
    ctx.translate(W / 2, top + lh * (i + 0.5));
    ctx.rotate((rnd() - 0.5) * 0.05);
    ctx.font = `${i === 0 ? '900' : '700'} ${size}px ${FONTS.marker}`;
    // double-stroke marker feel
    layeredText(ctx, ln, 0, 0, { fill: ink, outlines: [{ color: alpha(ink, 0.55), width: size * 0.06 }] });
    ctx.restore();
  });
}

// ---- 9. glossy orb ----------------------------------------------------------
function gloss(ctx, S) {
  const { W, H, pal, rnd } = S;
  const L = layout(S);
  if (!S.transparent) {
    ctx.fillStyle = linGrad(ctx, 0, 0, 0, H, [[0, shade(pal.bg[0][1], 0.1)], [1, pal.bg[1][1]]]);
    ctx.fillRect(0, 0, W, H);
  }
  const R = (L.wide ? H : Math.min(W, H)) * (L.wide ? 0.4 : 0.35);
  const cx = L.wide ? L.mcx : W / 2, cy = L.wide ? L.mcy : H * 0.41;
  ctx.save();
  ctx.shadowColor = alpha(pal.accent, 0.6); ctx.shadowBlur = R * 0.35; ctx.shadowOffsetY = R * 0.1;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7);
  const g = ctx.createRadialGradient(cx - R * (rnd() - 0.5) * 0.3, cy - R * (0.35 + rnd() * 0.2), R * 0.08, cx, cy + R * 0.2, R * 1.25);
  g.addColorStop(0, shade(pal.accent, 0.45));
  g.addColorStop(0.45, pal.accent);
  g.addColorStop(1, shade(pal.accent2 || pal.accent, -0.6));
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();

  drawSubject(ctx, S, cx, cy, R * 1.05, { shadow: alpha('#000', 0.3), shadowBlur: R * 0.1 });

  // top gloss cap
  ctx.save();
  const hy = 0.4 + rnd() * 0.12, hw = 0.58 + rnd() * 0.14;
  ctx.beginPath(); ctx.ellipse(cx, cy - R * hy, R * hw, R * (hy * 0.8), 0, 0, 7);
  ctx.fillStyle = linGrad(ctx, 0, cy - R * 0.9, 0, cy + R * 0.05, [[0, 'rgba(255,255,255,.62)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fill();
  // bottom bounce light
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.97, Math.PI * 0.2, Math.PI * 0.8);
  ctx.lineWidth = R * 0.05; ctx.strokeStyle = alpha('#ffffff', 0.35); ctx.stroke();
  ctx.restore();
  ctx.lineWidth = R * 0.014;
  ctx.strokeStyle = alpha('#ffffff', 0.5);
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();

  const t = tick(S);
  const tw = L.wide ? L.tw : W * 0.84;
  const size = fitFont(ctx, t, tw, FONTS.display, '900', Math.min(W, H) * 0.17, Math.min(W, H) * 0.14);
  const tcx = L.wide ? L.tcx : W / 2, tcy = L.wide ? H * 0.44 : H * 0.845;
  ctx.font = `900 ${size}px ${FONTS.display}`;
  layeredText(ctx, t, tcx, tcy, {
    fill: linGrad(ctx, 0, tcy - size * 0.5, 0, tcy + size * 0.5, [[0, '#ffffff'], [0.5, shade(pal.accent, 0.5)], [0.52, pal.accent], [1, shade(pal.accent, -0.35)]]),
    outlines: [{ color: alpha('#000', 0.55), width: size * 0.06 }],
  });
  const ny = tcy + size * 0.72;
  if (S.name && ny < H * 0.97) {
    ctx.font = `700 ${Math.min(W, H) * 0.034}px ${FONTS.display}`;
    tracked(ctx, S.name.toUpperCase().slice(0, 32), tcx, ny, Math.min(W, H) * 0.01, { fill: alpha(pal.ink, 0.7) });
  }
}

// ---- 10. flat monogram ------------------------------------------------------
function flat(ctx, S) {
  const { W, H, pal, rnd } = S;
  const L = layout(S);
  if (!S.transparent) {
    ctx.fillStyle = pal.bg[1][1];
    ctx.fillRect(0, 0, W, H);
  }
  const R = (L.wide ? H : Math.min(W, H)) * (L.wide ? 0.37 : 0.31);
  const cx = L.wide ? L.mcx : W / 2, cy = L.wide ? L.mcy : H * 0.38;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7);
  const da = rnd() * Math.PI * 2;
  ctx.fillStyle = linGrad(ctx, cx + Math.cos(da) * R, cy + Math.sin(da) * R, cx - Math.cos(da) * R, cy - Math.sin(da) * R,
    [[0, pal.accent], [1, shade(pal.accent2 || pal.accent, -0.15)]]);
  ctx.fill();
  const got = drawSubject(ctx, S, cx, cy, R * 1.1, {});
  if (!got) {
    const mono = (S.ticker || 'M').slice(0, rnd() > 0.45 ? 2 : 1).toUpperCase() || 'M';
    fitFont(ctx, mono, R * 1.25, FONTS.display, '900', R * 1.4);
    // long shadow
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#000';
    const lsx = rnd() > 0.5 ? 0.03 : -0.03;
    for (let i = 1; i < 60; i++) {
      ctx.save();
      ctx.translate(i * R * lsx, i * R * 0.03);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.02;
      ctx.fillText(mono, cx, cy);
      ctx.restore();
    }
    ctx.restore();
    layeredText(ctx, mono, cx, cy, { fill: readable(pal.accent) });
  }
  const t = tick(S);
  const tw = L.wide ? L.tw : W * 0.8;
  const size = fitFont(ctx, t, tw, FONTS.display, '900', Math.min(W, H) * 0.15, Math.min(W, H) * 0.12);
  const tcx = L.wide ? L.tx + tw / 2 : W / 2;
  const tcy = L.wide ? H * 0.44 : H * 0.8;
  ctx.font = `900 ${size}px ${FONTS.display}`;
  layeredText(ctx, t, tcx, tcy, { fill: pal.ink });
  const sub = (S.name || S.tagline || '').toUpperCase();
  const sy = tcy + size * 0.78;
  if (sub && sy < H * 0.97) {
    ctx.font = `700 ${Math.min(W, H) * 0.031}px ${FONTS.mono}`;
    tracked(ctx, sub.slice(0, 40), tcx, sy, Math.min(W, H) * 0.014, { fill: alpha(pal.ink, 0.6) });
  }
}

// ---- 11. terminal -----------------------------------------------------------
function terminal(ctx, S) {
  const { W, H, pal, rnd } = S;
  const green = pal.accent;
  if (!S.transparent) {
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, W, H);
  }
  const m = Math.min(W, H) * 0.07;
  ctx.strokeStyle = alpha(green, 0.5);
  ctx.lineWidth = Math.min(W, H) * 0.006;
  ctx.strokeRect(m, m, W - m * 2, H - m * 2);
  ctx.font = `700 ${Math.min(W, H) * 0.034}px ${FONTS.mono}`;
  ctx.fillStyle = alpha(green, 0.85);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const pool = [
    '> scanning mempool...',
    '> found: ' + (S.name || S.ticker || 'unnamed').toLowerCase(),
    '> supply  1,000,000,000',
    '> renounced  true',
    '> mint authority  burned',
    '> lp  locked',
    '> holders  ' + (120 + Math.floor(rnd() * 9000)),
    '> deploying bytecode...',
    '> top10  ' + (4 + Math.floor(rnd() * 20)) + '%',
  ];
  const lines = [pool[0], pool[1]];
  const rest = pool.slice(2);
  while (lines.length < 4 && rest.length) lines.push(rest.splice(Math.floor(rnd() * rest.length), 1)[0]);
  lines.forEach((l, i) => ctx.fillText(l, m * 1.5, m * 1.6 + i * Math.min(W, H) * 0.05));

  const hasMark = !!(S.bitmap || S.emoji);
  const wide = W / H > 1.5;
  if (hasMark) drawSubject(ctx, S, wide ? W * 0.2 : W / 2, wide ? H * 0.58 : H * 0.52, Math.min(W, H) * (wide ? 0.44 : 0.3), {});
  const t = (S.ticker || 'MEME').toUpperCase();
  const cy = wide ? H * 0.62 : (hasMark ? H * 0.78 : H * 0.55);
  // leave room for the trailing cursor block inside the border
  const size = fitFont(ctx, '$' + t + 'M', (wide ? W * 0.58 : W - m * 3.4), FONTS.mono, '700', Math.min(W, H) * 0.3, Math.min(W, H) * 0.24);
  ctx.font = `700 ${size}px ${FONTS.mono}`;
  const tw = ctx.measureText('$' + t).width;
  const cur = size * 0.5, gap = size * 0.12;
  const left = (wide ? W * 0.62 : W / 2) - (tw + gap + cur) / 2;
  ctx.save();
  ctx.shadowColor = green; ctx.shadowBlur = size * 0.22;
  layeredText(ctx, '$' + t, left + tw / 2, cy, { fill: green });
  ctx.restore();
  ctx.fillStyle = green;
  if (rnd() > 0.5) ctx.fillRect(left + tw + gap, cy - size * 0.35, cur, size * 0.7);
  else { ctx.lineWidth = size * 0.07; ctx.strokeStyle = green; ctx.strokeRect(left + tw + gap, cy - size * 0.35, cur, size * 0.7); }
  if (!S.transparent) {
    scanlines(ctx, W, H, 0.22, Math.max(2, Math.round(Math.min(W, H) / 260)));
    glow(ctx, W / 2, cy, Math.max(W, H) * 0.5, green, 0.1);
  }
}

// ---- 12. holo foil ----------------------------------------------------------
function holo(ctx, S) {
  const { W, H, pal, rnd } = S;
  const L = layout(S);
  const hues = ['#ff5fa2', '#ffd166', '#8bff6b', '#5fe6ff', '#9b6bff', '#ff5fa2'];
  if (!S.transparent) {
    ctx.fillStyle = linGrad(ctx, 0, 0, W, H, hues.map((c, i) => [i / (hues.length - 1), c]));
    ctx.fillRect(0, 0, W, H);
    // foil streaks
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    for (let i = 0; i < 26; i++) {
      const y = rnd() * H;
      ctx.fillStyle = alpha(rnd() > 0.5 ? '#ffffff' : '#000000', 0.08 + rnd() * 0.12);
      ctx.save();
      ctx.translate(W / 2, y);
      ctx.rotate(-0.5);
      ctx.fillRect(-W, 0, W * 2, Math.min(W, H) * (0.004 + rnd() * 0.02));
      ctx.restore();
    }
    ctx.restore();
    grain(ctx, W, H, 0.16, 2, rnd);
  }
  const got = drawSubject(ctx, S, L.mcx, L.mcy, L.msize, { outline: '#ffffff', outlineW: Math.min(W, H) * 0.02, shadow: 'rgba(0,0,0,.35)' });
  const by = L.wide ? L.mcy : H * 0.4;
  if (!got) {
    const r = Math.min(W, H) * 0.25;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = r * 0.2; ctx.shadowOffsetY = r * 0.05;
    burstPath(ctx, L.mcx, by, 18, r, r * 0.82, rnd() * 3, 0.05, rnd);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
    ctx.lineWidth = r * 0.05; ctx.strokeStyle = '#0a0a0c'; ctx.stroke();
    const mono = (S.ticker || 'M').slice(0, 3).toUpperCase();
    fitFont(ctx, mono, r * 1.1, FONTS.display, '900', r);
    layeredText(ctx, mono, L.mcx, by, { fill: '#0a0a0c' });
  }
  const t = tick(S);
  const tw = L.wide ? L.tw : W * 0.86;
  const size = fitFont(ctx, t, tw, FONTS.display, '900', Math.min(W, H) * 0.3, Math.min(W, H) * 0.22);
  const tcx = L.wide ? L.tcx : W / 2, tcy = L.wide ? H * 0.5 : (got ? H * 0.84 : H * 0.78);
  ctx.font = `900 ${size}px ${FONTS.display}`;
  layeredText(ctx, t, tcx, tcy, {
    fill: '#ffffff',
    outlines: [{ color: '#0a0a0c', width: size * 0.1 }, { color: alpha('#ffffff', 0.9), width: size * 0.02 }],
    shadow: { color: 'rgba(0,0,0,.45)', blur: size * 0.1, dy: size * 0.03 },
  });
}

// ---- shared wide-mode text block -------------------------------------------
function wideText(ctx, S, L) {
  const t = tick(S);
  const size = fitFont(ctx, t, L.tw, FONTS.display, '900', S.H * 0.46, S.H * 0.4);
  ctx.font = `900 ${size}px ${FONTS.display}`;
  layeredText(ctx, t, L.tx + L.tw / 2, S.H * (S.name ? 0.42 : 0.5), {
    fill: S.pal.ink,
    outlines: [{ color: alpha('#000', 0.45), width: size * 0.05 }],
  });
  if (S.name) {
    ctx.font = `700 ${S.H * 0.07}px ${FONTS.mono}`;
    tracked(ctx, S.name.toUpperCase().slice(0, 34), L.tx + L.tw / 2, S.H * 0.72, S.H * 0.012, { fill: alpha(S.pal.ink, 0.72) });
  }
}

export const TEMPLATES = [
  { id: 'coin', label: 'Coin Mint', draw: coin },
  { id: 'chrome', label: 'Liquid Chrome', draw: chrome },
  { id: 'sticker', label: 'Die-Cut Sticker', draw: sticker },
  { id: 'pfpring', label: 'Neon PFP', draw: pfpring },
  { id: 'comic', label: 'Comic Pop', draw: comic },
  { id: 'holo', label: 'Holo Foil', draw: holo },
  { id: 'gloss', label: 'Glossy Orb', draw: gloss },
  { id: 'crt', label: 'VHS / CRT', draw: crt },
  { id: 'pixel', label: 'Pixel Retro', draw: pixel },
  { id: 'terminal', label: 'Terminal', draw: terminal },
  { id: 'sign', label: 'Marker Sign', draw: sign },
  { id: 'flat', label: 'Flat Token', draw: flat },
];

export function render(canvas, S) {
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const tpl = TEMPLATES.find(t => t.id === S.template) || TEMPLATES[0];
  const state = { ...S, W: canvas.width, H: canvas.height };
  state.rnd = mulberry32(hashStr(String(S.seed) + '|' + S.template + '|' + (S.pal && S.pal.id)));
  try { tpl.draw(ctx, state); } catch (e) { console.error('render ' + tpl.id, e); }
  ctx.restore();
  return canvas;
}
