// The tag's numbers. If any of these fail, the card would show a figure that
// does not mean what the page says it means.

import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_AREA,
  THRESHOLD,
  changeStats,
  coverage,
  deltaE2000,
  hexToRgb,
  labToRgb,
  rgbToHex,
  rgbToLab,
  shadeCheck,
} from "../public/measure.js";

function solid(w, h, [r, g, b]) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < a.length; i += 4) a.set([r, g, b, 255], i);
  return a;
}
function paint(arr, w, x0, y0, x1, y1, rgb) {
  const out = new Uint8ClampedArray(arr);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.set([...rgb, 255], (y * w + x) * 4);
  return out;
}

test("changed area counts pixels that moved by at least the threshold, and nothing else", () => {
  const w = 10;
  const h = 10;
  const a = solid(w, h, [100, 100, 100]);
  const below = paint(a, w, 0, 0, 10, 10, [100 + THRESHOLD - 1, 100, 100]);
  assert.equal(changeStats(a, below, w, h).changed, 0, "a shift just under the threshold is noise");
  const b = paint(a, w, 2, 3, 6, 5, [100, 100 - THRESHOLD, 100]);
  const st = changeStats(a, b, w, h);
  assert.equal(st.changed, 8);
  assert.equal(st.area, 0.08);
  assert.deepEqual(st.bbox, { x: 0.2, y: 0.3, w: 0.4, h: 0.2 });
  assert.equal(st.mask.reduce((s, v) => s + v, 0), 8);
});

test("changeStats refuses arrays that do not match the declared size", () => {
  assert.throws(() => changeStats(new Uint8ClampedArray(16), new Uint8ClampedArray(16), 3, 3));
});

test("CIEDE2000 matches the published test pairs (Sharma, Wu & Dalal 2005)", () => {
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[50, -0.001, 2.49], [50, 0.0009, -2.49], 4.8045],
  ];
  for (const [a, b, want] of pairs) assert.equal(deltaE2000(a, b).toFixed(4), want.toFixed(4));
  assert.equal(deltaE2000([40, 10, 10], [40, 10, 10]), 0);
});

test("colour conversions round-trip", () => {
  for (const hex of ["#1B1717", "#E3D3A8", "#A0461E", "#FFFFFF", "#000000"]) {
    assert.equal(rgbToHex(labToRgb(...rgbToLab(...hexToRgb(hex)))), hex);
  }
  assert.throws(() => hexToRgb("red"));
});

test("shade check reports distance to the target before and after, on the changed pixels only", () => {
  const w = 4;
  const h = 4;
  const target = "#1B1717";
  const before = paint(solid(w, h, [240, 240, 240]), w, 0, 0, 4, 2, [98, 73, 55]); // brown top half, white rest
  const after = paint(before, w, 0, 0, 4, 2, [30, 26, 25]); // top half dyed near the target
  const { mask } = changeStats(before, after, w, h);
  const s = shadeCheck(before, after, mask, target);
  assert.ok(s.after < s.before, "moved closer to the shade");
  assert.ok(s.after < 3, `after should be near the target, got ${s.after}`);
  assert.equal(s.beforeHex, "#624937");
  assert.equal(shadeCheck(before, before, new Uint8Array(w * h), target), null, "no changed pixels, no verdict");
});

test("coverage: a piece counts only if YouCam succeeded and something visibly changed", () => {
  const cov = coverage([
    { kind: "hairstyle", status: "done", area: 0.25 },
    { kind: "hairColor", status: "done", area: MIN_AREA / 2 },
    { kind: "makeup", status: "failed" },
    { kind: "earrings", status: "done", area: MIN_AREA },
    { kind: "hat", status: "done" },
  ]);
  assert.equal(cov.planned, 5);
  assert.equal(cov.landed, 3);
  assert.deepEqual(
    cov.perStep.map((p) => p.landed),
    [true, false, false, true, true],
  );
  assert.match(cov.perStep[1].why, /almost nothing changed/);
  assert.match(cov.perStep[4].why, /not pixel-checked/);
  assert.equal(coverage([]).ratio, 0);
});
