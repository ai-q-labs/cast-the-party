/**
 * Cast the Party: entry point.
 *
 *   YOUCAM_API_KEY        enables live renders (without it, the page and the
 *                         example cards still work)
 *   PORT                  defaults to 3000
 *   RENDERS_PER_VISITOR, DAILY_UNIT_CAP, MAX_CONCURRENT   see src/limits.js
 *   LIVE_RENDERS=off      serve the page without spending any units
 */

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./src/app.js";
import { loadApiKey } from "./src/key.js";
import { createLimits, limitsFromEnv } from "./src/limits.js";
import { createYouCam } from "./src/youcam.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const { key, source } = loadApiKey();
const live = Boolean(key) && process.env.LIVE_RENDERS !== "off";
const yc = live ? createYouCam({ apiKey: key, base: process.env.YOUCAM_API_BASE || undefined }) : null;
const caps = limitsFromEnv();
const app = createApp({
  yc,
  limits: createLimits(caps),
  publicDir: path.join(HERE, "public"),
  log: (line) => process.stdout.write(`${line}\n`),
});

http.createServer(app.handle).listen(PORT, () => {
  process.stdout.write(`Cast the Party on http://localhost:${PORT}\n`);
  process.stdout.write(
    live
      ? `Live renders on (key from ${source}); caps: ${caps.perVisitor}/visitor/day, ${caps.dailyUnits} units/day, ${caps.maxConcurrent} at once.\n`
      : "Live renders off: no YouCam key, or LIVE_RENDERS=off. Example cards still work.\n",
  );
});
