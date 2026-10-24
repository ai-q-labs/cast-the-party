// The HTTP side: zero dependencies, Node's own http and fs.
//
//   GET  /api/config               characters, caps, whether live renders are on
//   POST /api/render               start a render (photo + character + consent)
//   GET  /api/render/:id           progress and per-layer results
//   GET  /api/render/:id/img/:n    one layer's image (same origin, so the page
//                                  can measure it on a canvas)
//   GET  /*                        ./public
//
// Photos and results live only in this process's memory, for at most
// JOB_TTL_MS (15 minutes by default), and are never written to disk. YouCam
// keeps uploaded and generated files for 30 days on its side.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CHARACTERS, UNITS, PROPS, LAYER_LABELS } from "../public/characters.js";
import { chooseLayers, findCharacter, plannedUnits } from "./plan.js";
import { createPropStore, runLook } from "./pipeline.js";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const SECURITY = {
  "content-security-policy":
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
};

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const DEMO_FACES = ["face-a", "face-b", "face-c"];

// Width and height from a JPEG's SOF segment, without decoding the image.
export function jpegSize(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

// YouCam labels results "binary/octet-stream"; hair colour, makeup and earrings
// come back as PNG, hairstyle and hat as JPEG.
export function sniffImageType(buf) {
  if (buf?.[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf?.[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  return "application/octet-stream";
}

function visitorOf(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "unknown";
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const e = new Error("too large");
      e.status = 413;
      throw e;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createApp({ yc, limits, publicDir, jobTtlMs = 15 * 60 * 1000, now = Date.now, log = () => {} }) {
  const jobs = new Map();
  const propIds = yc ? createPropStore(yc, publicDir) : null;

  function sweep() {
    const t = now();
    for (const [id, job] of jobs) if (t - job.createdAt > jobTtlMs && job.state !== "running") jobs.delete(id);
  }
  // Also on a timer, so results do not outlive the window when traffic stops.
  setInterval(sweep, Math.min(60_000, jobTtlMs)).unref();

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { "cache-control": "no-store", ...SECURITY, ...headers });
    res.end(body);
  }
  const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { "content-type": TYPES[".json"] });

  function publicJob(job) {
    return {
      id: job.id,
      state: job.state,
      characterId: job.character.id,
      variant: job.variant,
      units: job.steps.reduce((s, x) => s + (x.units || 0), 0),
      plannedUnits: job.plannedUnits,
      steps: job.steps.map((s, n) => ({
        kind: s.kind,
        label: LAYER_LABELS[s.kind],
        status: s.status,
        units: s.units,
        ms: s.ms,
        error: s.error || null,
        image: s.image ? `/api/render/${job.id}/img/${n}` : null,
      })),
      error: job.error || null,
    };
  }

  async function loadPhoto(body) {
    if (typeof body.photo !== "string") return { error: "No photo was sent." };
    let bytes;
    let demo = null;
    if (body.photo.startsWith("demo:")) {
      demo = body.photo.slice(5);
      if (!DEMO_FACES.includes(demo)) return { error: "Unknown demo face." };
      bytes = await readFile(path.join(publicDir, "demo-faces", `${demo}.jpg`));
    } else {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.photo);
      if (!m) return { error: "The photo must be a JPEG." };
      bytes = Buffer.from(m[1], "base64");
    }
    if (bytes.length > MAX_PHOTO_BYTES) return { error: "The photo is larger than 3 MB." };
    const size = jpegSize(bytes);
    if (!size) return { error: "The photo is not a readable JPEG." };
    const long = Math.max(size.width, size.height);
    if (long > 1024 || Math.min(size.width, size.height) < 320)
      return { error: "The photo must be between 320 and 1024 pixels on its long side (the page resizes it for you)." };
    return { bytes, demo };
  }

  async function startRender(req, res) {
    if (!yc) return json(res, 503, { error: "Live renders are off on this server (no YouCam key). The example cards still work." });
    let body;
    try {
      body = JSON.parse(await readBody(req, 5 * 1024 * 1024));
    } catch (e) {
      return json(res, e.status === 413 ? 413 : 400, { error: e.status === 413 ? "The photo is too large." : "Bad request." });
    }
    const character = findCharacter(body.characterId);
    if (!character) return json(res, 400, { error: "Unknown character." });
    if (!character.variants[body.variant]) return json(res, 400, { error: "Pick a hairstyle set." });
    const photo = await loadPhoto(body);
    if (photo.error) return json(res, 400, { error: photo.error });
    // A real person's photo needs their say-so; the demo faces are AI-generated.
    if (!photo.demo && body.consent !== true) return json(res, 400, { error: "Tick the consent box to send this photo to YouCam." });

    const layers = chooseLayers(character, body.skip);
    const cost = plannedUnits(layers);
    const visitor = visitorOf(req);
    const reservation = limits.reserve(visitor, cost);
    if (!reservation.ok) return json(res, 429, { error: reservation.reason });

    sweep();
    const job = {
      id: randomUUID(),
      createdAt: now(),
      state: "running",
      character,
      variant: body.variant,
      layers,
      plannedUnits: cost,
      steps: layers.map((kind) => ({ kind, status: "waiting", units: 0, ms: 0 })),
    };
    jobs.set(job.id, job);
    log(`[render] ${job.id.slice(0, 8)} ${character.id}/${body.variant} ${layers.join(",")} (${photo.demo ? `demo ${photo.demo}` : "upload"})`);

    runLook(yc, { character, variant: body.variant, layers, photo: photo.bytes }, {
      propIds,
      onChange: (steps) => {
        job.steps = steps;
      },
    })
      .then((steps) => {
        job.steps = steps;
        job.state = "done";
      })
      .catch((err) => {
        job.state = "failed";
        job.error = "The photo could not be sent to YouCam. Try again.";
        log(`[render] ${job.id.slice(0, 8)} failed before the first layer: ${err?.code || err?.message}`);
      })
      .finally(() => {
        const used = job.steps.reduce((s, x) => s + (x.units || 0), 0);
        limits.settle(reservation.ticket, used);
        log(`[render] ${job.id.slice(0, 8)} ${job.state}, ${used} units`);
      });

    return json(res, 202, { id: job.id, plannedUnits: cost });
  }

  async function serveStatic(res, pathname) {
    const root = path.resolve(publicDir);
    let rel;
    try {
      rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
    } catch {
      return send(res, 400, "Bad request");
    }
    const target = path.resolve(root, rel);
    if (target !== root && !target.startsWith(root + path.sep)) return send(res, 403, "Forbidden");
    try {
      const data = await readFile(target);
      const type = TYPES[path.extname(target).toLowerCase()] || "application/octet-stream";
      const cache = /\.(jpg|png|woff2)$/.test(target) ? { "cache-control": "public, max-age=3600" } : {};
      res.writeHead(200, { "cache-control": "no-store", ...SECURITY, "content-type": type, ...cache });
      return res.end(data);
    } catch {
      return send(res, 404, "Not found");
    }
  }

  async function handle(req, res) {
    const { pathname } = new URL(req.url, "http://localhost");
    try {
      if (pathname === "/api/config" && req.method === "GET") {
        return json(res, 200, {
          live: Boolean(yc),
          characters: CHARACTERS,
          units: UNITS,
          props: PROPS,
          labels: LAYER_LABELS,
          demoFaces: DEMO_FACES,
          caps: limits.snapshot(visitorOf(req)),
          retentionMinutes: Math.round(jobTtlMs / 60000),
        });
      }
      if (pathname === "/api/render" && req.method === "POST") return await startRender(req, res);

      const m = /^\/api\/render\/([0-9a-f-]{36})(?:\/img\/(\d+))?$/.exec(pathname);
      if (m && req.method === "GET") {
        const job = jobs.get(m[1]);
        if (!job) return json(res, 404, { error: "This render has expired or never existed." });
        if (m[2] === undefined) return json(res, 200, publicJob(job));
        const step = job.steps[Number(m[2])];
        if (!step?.image) return json(res, 404, { error: "No image for this layer." });
        res.writeHead(200, { ...SECURITY, "cache-control": "private, no-store", "content-type": sniffImageType(step.image.bytes) });
        return res.end(step.image.bytes);
      }
      if (pathname.startsWith("/api/")) return json(res, 404, { error: "No such endpoint." });
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
      return await serveStatic(res, pathname);
    } catch (err) {
      log(`[error] ${err?.message || err}`);
      return json(res, 500, { error: "Something went wrong. Try again." });
    }
  }

  return { handle, jobs };
}
