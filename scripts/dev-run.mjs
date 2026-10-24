// Development runner: one paid YouCam task at a time, with the account balance
// read before and after so `_dev_units.log` records what was actually charged,
// not what we expected to be charged.
//
//   node scripts/dev-run.mjs gen <out-name> <size> <prompt.txt> [purpose]
//   node scripts/dev-run.mjs task <task-path> <payload.json> <out-name> [purpose]
//
// In a payload, a string "@file:relative/path.jpg" is uploaded first and
// replaced by its file_id, and "@url:<out-name>" is replaced by the result URL
// of an earlier run. Results are written to _dev/out/ (git-ignored).
// DEV_UNIT_BUDGET (default 250) stops the runner before it can go over.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApiKey } from "../src/key.js";
import { createYouCam } from "../src/youcam.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = path.join(ROOT, "_dev", "out");
const LOG = path.join(ROOT, "_dev_units.log");
const BUDGET = Number(process.env.DEV_UNIT_BUDGET || 250);
mkdirSync(OUT, { recursive: true });

const { key } = loadApiKey();
if (!key) {
  console.error("No YouCam key found.");
  process.exit(1);
}
const yc = createYouCam({ apiKey: key, base: process.env.YOUCAM_API_BASE || undefined });

async function balance() {
  const r = await yc.get("/s2s/v1.0/client/credit");
  return (r.results || []).reduce((s, x) => s + Number(x.amount_dec ?? x.amount ?? 0), 0);
}

function spentSoFar() {
  if (!existsSync(LOG)) return 0;
  return readFileSync(LOG, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .reduce((s, l) => s + (Number(l.split("\t")[2]) || 0), 0);
}

function log(feature, units, purpose, after) {
  if (!existsSync(LOG)) {
    writeFileSync(LOG, "# date(UTC)\tfeature\tunits (balance before - after)\tpurpose\tbalance after\n");
  }
  appendFileSync(LOG, `${new Date().toISOString()}\t${feature}\t${units}\t${purpose}\t${after}\n`);
}

const uploaded = new Map(); // same path -> same file_id within one run

async function substituteFiles(value) {
  if (typeof value === "string" && value.startsWith("@file:")) {
    const p = path.resolve(ROOT, value.slice(6));
    if (!uploaded.has(p)) {
      const bytes = readFileSync(p);
      const type = /\.png$/i.test(p) ? "image/png" : "image/jpeg";
      uploaded.set(p, await yc.upload(bytes, { contentType: type, fileName: path.basename(p) }));
    }
    return uploaded.get(p);
  }
  if (typeof value === "string" && value.startsWith("@url:")) {
    return readFileSync(path.join(OUT, value.slice(5) + ".url.txt"), "utf8").trim();
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const v of value) out.push(await substituteFiles(v));
    return out;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await substituteFiles(v);
    return out;
  }
  return value;
}

async function paid(feature, purpose, fn) {
  const spent = spentSoFar();
  if (spent >= BUDGET) throw new Error(`dev budget reached (${spent}/${BUDGET} units)`);
  const before = await balance();
  let result;
  let error;
  try {
    result = await fn();
  } catch (e) {
    error = e;
  }
  const after = await balance();
  const units = Math.round((before - after) * 100) / 100;
  log(feature, units, purpose + (error ? ` [FAILED: ${error.code || error.message}]` : ""), after);
  console.log(`units: ${units} (balance ${before} -> ${after}; dev total ${spent + units}/${BUDGET})`);
  if (error) throw error;
  return result;
}

async function save(url, name) {
  const { bytes, type } = await yc.download(url);
  const ext = type.includes("png") ? ".png" : ".jpg";
  const file = path.join(OUT, name + ext);
  writeFileSync(file, bytes);
  console.log(`saved _dev/out/${name}${ext} (${bytes.length} bytes, ${type})`);
  writeFileSync(path.join(OUT, name + ".url.txt"), url);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "gen") {
  const [name, size, promptFile, purpose = "image generation"] = args;
  const prompt = readFileSync(path.resolve(ROOT, promptFile), "utf8").trim();
  const r = await paid("text-to-image/youcam", `${purpose}: ${name}`, () =>
    yc.run("/s2s/v2.0/task/text-to-image/youcam", { model: "youcam-image-v2", prompt, size, prompt_extend: false }),
  );
  await save(r.url, name);
} else if (cmd === "task") {
  const [taskPath, payloadFile, name, purpose = "dev test"] = args;
  const payload = await substituteFiles(JSON.parse(readFileSync(path.resolve(ROOT, payloadFile), "utf8")));
  const feature = taskPath.replace(/^\/s2s\/v[\d.]+\/task\//, "");
  const r = await paid(feature, `${purpose}: ${name}`, () => yc.run(taskPath, payload));
  await save(r.url, name);
} else if (cmd === "balance") {
  console.log(await balance());
} else {
  console.error("usage: dev-run.mjs gen|task|balance ...");
  process.exit(2);
}
