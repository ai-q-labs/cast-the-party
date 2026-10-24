// The server, over real HTTP with a fake YouCam: consent, photo checks, caps,
// job progress, what the browser can and cannot fetch.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, jpegSize, sniffImageType } from "../src/app.js";
import { createLimits } from "../src/limits.js";
import { fakeYouCam } from "./fake-youcam.mjs";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

// The smallest byte string jpegSize() reads as a JPEG of w x h.
function fakeJpeg(w, h) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  const sof = Buffer.alloc(19);
  sof.set([0xff, 0xc0, 0x00, 0x11, 0x08]);
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}
const dataUrl = (buf) => `data:image/jpeg;base64,${buf.toString("base64")}`;

async function serve({ yc = fakeYouCam(), limits = createLimits({ perVisitor: 2, dailyUnits: 20, maxConcurrent: 2 }) } = {}) {
  const app = createApp({ yc, limits, publicDir: PUBLIC });
  const server = http.createServer(app.handle).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, yc, app, close: () => server.close() };
}

const post = (base, body, headers = {}) =>
  fetch(`${base}/api/render`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function waitDone(base, id) {
  for (let i = 0; i < 100; i++) {
    const job = await (await fetch(`${base}/api/render/${id}`)).json();
    if (job.state !== "running") return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("job never finished");
}

test("jpegSize reads dimensions without decoding, and rejects non-JPEG", () => {
  assert.deepEqual(jpegSize(fakeJpeg(768, 1024)), { width: 768, height: 1024 });
  assert.equal(jpegSize(Buffer.from("not a jpeg")), null);
  assert.equal(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "image/png");
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8, 0xff])), "image/jpeg");
});

test("a demo-face render runs end to end and serves each layer's image from this origin", async () => {
  const s = await serve();
  const res = await post(s.base, { characterId: "club-singer", variant: "female", photo: "demo:face-c" });
  assert.equal(res.status, 202);
  const { id, plannedUnits } = await res.json();
  assert.equal(plannedUnits, 4);
  const job = await waitDone(s.base, id);
  assert.equal(job.state, "done");
  assert.equal(job.units, 4);
  assert.deepEqual(job.steps.map((x) => x.kind), ["hairstyle", "hairColor", "makeup", "earrings"]);
  const img0 = await fetch(`${s.base}${job.steps[0].image}`);
  assert.equal(img0.headers.get("content-type"), "image/jpeg");
  const img1 = await fetch(`${s.base}${job.steps[1].image}`);
  assert.equal(img1.headers.get("content-type"), "image/png");
  assert.ok(!JSON.stringify(job).includes("storage.example"), "YouCam result links are not handed to the browser");
  s.close();
});

test("an uploaded photo needs consent; a demo face does not", async () => {
  const s = await serve();
  const photo = dataUrl(fakeJpeg(768, 1024));
  const noConsent = await post(s.base, { characterId: "inn-keeper", variant: "female", photo });
  assert.equal(noConsent.status, 400);
  assert.match((await noConsent.json()).error, /consent/);
  const ok = await post(s.base, { characterId: "inn-keeper", variant: "female", photo, consent: true });
  assert.equal(ok.status, 202);
  s.close();
});

test("photos that YouCam's hairstyle engine would refuse are stopped here", async () => {
  const s = await serve();
  const cases = [
    [{ photo: "data:image/png;base64,iVBORw0KGgo=" }, /JPEG/],
    [{ photo: dataUrl(fakeJpeg(2000, 1500)) }, /1024/],
    [{ photo: dataUrl(fakeJpeg(200, 300)) }, /320/],
    [{ photo: dataUrl(Buffer.from("hello")) }, /readable JPEG/],
    [{ photo: "demo:../../server" }, /Unknown demo face/],
    [{ photo: "demo:face-a", characterId: "nobody" }, /Unknown character/],
    [{ photo: "demo:face-a", variant: "other" }, /hairstyle set/],
  ];
  for (const [over, why] of cases) {
    const res = await post(s.base, { characterId: "inn-keeper", variant: "female", consent: true, ...over });
    assert.equal(res.status, 400, String(why));
    assert.match((await res.json()).error, why);
  }
  assert.equal(s.yc.calls.upload.length, 0, "nothing reached YouCam");
  s.close();
});

test("caps: per visitor, then the daily unit budget", async () => {
  const s = await serve({ limits: createLimits({ perVisitor: 2, dailyUnits: 9, maxConcurrent: 5 }) });
  const go = (ip, characterId = "inn-keeper") => post(s.base, { characterId, variant: "female", photo: "demo:face-a" }, { "x-forwarded-for": ip });
  const a1 = await go("1.1.1.1");
  const a2 = await go("1.1.1.1");
  const a3 = await go("1.1.1.1");
  assert.deepEqual([a1.status, a2.status, a3.status], [202, 202, 429]);
  assert.match((await a3.json()).error, /per visitor/);
  // 6 of 9 units used; a 6-unit look no longer fits, a 3-unit one does.
  const big = await go("2.2.2.2", "night-editor");
  assert.equal(big.status, 429);
  assert.match((await big.json()).error, /budget/);
  assert.equal((await go("2.2.2.2")).status, 202);
  s.close();
});

test("the daily budget is settled to what was actually counted", () => {
  let t = Date.parse("2026-11-01T10:00:00Z");
  const lim = createLimits({ perVisitor: 9, dailyUnits: 10, maxConcurrent: 9, now: () => t });
  const r = lim.reserve("v", 6);
  assert.equal(lim.snapshot("v").unitsUsedToday, 6);
  lim.settle(r.ticket, 4);
  assert.equal(lim.snapshot("v").unitsUsedToday, 4, "a skipped layer gives its units back");
  lim.settle(r.ticket, 0);
  assert.equal(lim.snapshot("v").unitsUsedToday, 4, "settling twice changes nothing");
  t = Date.parse("2026-11-02T00:00:01Z");
  assert.equal(lim.snapshot("v").unitsUsedToday, 0, "resets at 00:00 UTC");
  assert.equal(lim.snapshot("v").visitorRendersLeft, 9);
});

test("without a key the page works and live renders say so", async () => {
  const s = await serve({ yc: null });
  const cfg = await (await fetch(`${s.base}/api/config`)).json();
  assert.equal(cfg.live, false);
  assert.equal(cfg.characters.length, 6);
  const res = await post(s.base, { characterId: "inn-keeper", variant: "female", photo: "demo:face-a" });
  assert.equal(res.status, 503);
  s.close();
});

test("static files: served with security headers; nothing outside public/ is reachable", async () => {
  const s = await serve();
  const index = await fetch(`${s.base}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal(index.headers.get("x-content-type-options"), "nosniff");
  for (const p of ["/../server.js", "/%2e%2e/server.js", "/..%2fsrc/key.js", "/%2e%2e%5csrc%5ckey.js"]) {
    const r = await fetch(`${s.base}${p}`);
    assert.ok([400, 403, 404].includes(r.status), `${p} -> ${r.status}`);
    assert.ok(!(await r.text()).includes("loadApiKey"), p);
  }
  assert.equal((await fetch(`${s.base}/api/render/00000000-0000-0000-0000-000000000000`)).status, 404);
  assert.equal((await fetch(`${s.base}/api/nope`)).status, 404);
  s.close();
});

test("finished jobs are dropped from memory after the retention window", async () => {
  let t = 0;
  const yc = fakeYouCam();
  const app = createApp({ yc, limits: createLimits(), publicDir: PUBLIC, jobTtlMs: 1000, now: () => t });
  const server = http.createServer(app.handle).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { id } = await (await post(base, { characterId: "inn-keeper", variant: "female", photo: "demo:face-b" })).json();
  await waitDone(base, id);
  t = 5000;
  await post(base, { characterId: "inn-keeper", variant: "female", photo: "demo:face-b" }); // any new render sweeps
  assert.equal((await fetch(`${base}/api/render/${id}`)).status, 404);
  server.close();
});
