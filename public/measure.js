// The measurements behind each costume card. Pure functions over RGBA pixel
// arrays: the page feeds them canvas pixels, the tests feed them hand-made
// arrays, and the numbers come out the same either way.
//
// What is measured, for every face-card layer (hairstyle, hair colour, makeup,
// earrings), comparing the image that went into YouCam with the one that came
// back, both drawn at the same size:
//
//   changed area   the share of pixels where some colour channel moved by at
//                  least THRESHOLD (24 of 255). Below that is JPEG/PNG noise:
//                  on our test renders, makeup-only changes measured 1.05% at
//                  24 and 1.70% at 12, while the face itself stayed put.
//   landed         YouCam said "success" AND the changed area is at least
//                  MIN_AREA (0.05% of the picture). A success that changed
//                  nothing visible does not count as the piece being shown.
//   coverage       landed layers / planned layers. The hat portrait is a new
//                  composition (outfit, background, framing), so it cannot be
//                  compared pixel for pixel; it counts on YouCam's success
//                  alone, and the card says so.
//   shade distance for the hair-colour layer: CIEDE2000 colour difference
//                  between the shade the character calls for and the median
//                  colour (in CIELAB) of the pixels that layer changed, before
//                  and after. Real hair has highlights and shadow, so 0 is not
//                  expected; the point is the drop from before to after.

export const THRESHOLD = 24;
export const MIN_AREA = 0.0005;

export function changeStats(a, b, width, height, threshold = THRESHOLD) {
  const total = width * height;
  if (a.length !== total * 4 || b.length !== total * 4) throw new Error("pixel arrays must match width x height");
  const mask = new Uint8Array(total);
  let changed = 0;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d >= threshold) {
      mask[p] = 1;
      changed++;
      const x = p % width;
      const y = (p - x) / width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return {
    changed,
    total,
    area: changed / total,
    mask,
    bbox: changed ? { x: x0 / width, y: y0 / height, w: (x1 - x0 + 1) / width, h: (y1 - y0 + 1) / height } : null,
  };
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// sRGB (0-255) -> CIELAB, D65 white.
export function rgbToLab(r, g, b) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const X = inv(fx) * 0.95047;
  const Y = inv(fy);
  const Z = inv(fz) * 1.08883;
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const gam = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  return [gam(R), gam(G), gam(B)];
}

// CIEDE2000 (Sharma, Wu & Dalal, 2005), kL = kC = kH = 1.
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hp = (b, a) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h >= 0 ? h : h + 360;
  };
  const h1p = hp(b1, a1p);
  const h2p = hp(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * rad) +
    0.24 * Math.cos(2 * hbp * rad) +
    0.32 * Math.cos((3 * hbp + 6) * rad) -
    0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

function median(values) {
  if (!values.length) return NaN;
  const s = Float64Array.from(values).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function medianLab(pixels, mask) {
  const L = [];
  const A = [];
  const B = [];
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const i = p * 4;
    const [l, a, b] = rgbToLab(pixels[i], pixels[i + 1], pixels[i + 2]);
    L.push(l);
    A.push(a);
    B.push(b);
  }
  return [median(L), median(A), median(B)];
}

// Distance from the target shade, on the pixels the hair-colour layer changed.
export function shadeCheck(before, after, mask, targetHex) {
  const target = rgbToLab(...hexToRgb(targetHex));
  if (!mask.some((v) => v)) return null;
  const labBefore = medianLab(before, mask);
  const labAfter = medianLab(after, mask);
  return {
    target: targetHex.toUpperCase(),
    before: deltaE2000(labBefore, target),
    after: deltaE2000(labAfter, target),
    beforeHex: rgbToHex(labToRgb(...labBefore)),
    afterHex: rgbToHex(labToRgb(...labAfter)),
  };
}

// steps: [{ kind, status, area? }] in plan order.
export function coverage(steps, minArea = MIN_AREA) {
  const perStep = steps.map((s) => {
    if (s.status !== "done") return { kind: s.kind, landed: false, why: "YouCam could not apply it" };
    if (s.kind === "hat") return { kind: s.kind, landed: true, why: "YouCam success (a new composition, not pixel-checked)" };
    if (!(s.area >= minArea)) return { kind: s.kind, landed: false, why: "YouCam said success, but almost nothing changed" };
    return { kind: s.kind, landed: true, why: "visible change measured" };
  });
  const landed = perStep.filter((s) => s.landed).length;
  return { planned: steps.length, landed, ratio: steps.length ? landed / steps.length : 0, perStep };
}

// A translucent overlay that paints the changed pixels, for the change map.
export function overlayFromMask(mask, [r, g, b] = [255, 64, 129], alpha = 170) {
  const out = new Uint8ClampedArray(mask.length * 4);
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const i = p * 4;
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = alpha;
  }
  return out;
}
