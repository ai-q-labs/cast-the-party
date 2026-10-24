// Renders the example tags shown on the page, through the same pipeline the
// server uses, on the AI-generated demo faces. Spends real units (logged to
// _dev_units.log from the account balance before and after).
//
//   node scripts/make-samples.mjs <character-id> <face-a|face-b|face-c> <female|male>
//
// Writes _dev/samples/<character-id>/ (raw YouCam results, git-ignored) and a
// manifest.json; scripts/publish-examples.py turns them into public/examples/.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApiKey } from "../src/key.js";
import { createYouCam } from "../src/youcam.js";
import { chooseLayers, findCharacter, plannedUnits } from "../src/plan.js";
import { createPropStore, runLook } from "../src/pipeline.js";
import { sniffImageType } from "../src/app.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const LOG = path.join(ROOT, "_dev_units.log");
const BUDGET = Number(process.env.DEV_UNIT_BUDGET || 250);

const [id, face, variant] = process.argv.slice(2);
const character = findCharacter(id);
if (!character || !["face-a", "face-b", "face-c"].includes(face) || !character.variants[variant]) {
  console.error("usage: make-samples.mjs <character-id> <face-a|face-b|face-c> <female|male>");
  process.exit(2);
}
const { key } = loadApiKey();
const yc = createYouCam({ apiKey: key });

const spent = existsSync(LOG)
  ? readFileSync(LOG, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#")).reduce((s, l) => s + (Number(l.split("\t")[2]) || 0), 0)
  : 0;
const layers = chooseLayers(character, []);
if (spent + plannedUnits(layers) > BUDGET) {
  console.error(`would exceed the dev budget (${spent} + ${plannedUnits(layers)} > ${BUDGET})`);
  process.exit(1);
}

const balance = async () => (await yc.get("/s2s/v1.0/client/credit")).results.reduce((s, x) => s + Number(x.amount_dec ?? x.amount), 0);
const before = await balance();
const t0 = Date.now();
const steps = await runLook(
  yc,
  { character, variant, layers, photo: readFileSync(path.join(PUBLIC, "demo-faces", `${face}.jpg`)) },
  {
    propIds: createPropStore(yc, PUBLIC),
    onChange: (s) => process.stdout.write(`\r${s.map((x) => `${x.kind}:${x.status}`).join("  ")}   `),
  },
);
const after = await balance();
const units = Math.round((before - after) * 100) / 100;
const counted = steps.reduce((s, x) => s + x.units, 0);
appendFileSync(LOG, `${new Date().toISOString()}\tlook:${layers.join("+")}\t${units}\texample tag ${id} on ${face} (${variant}); app counted ${counted}\t${after}\n`);

const dir = path.join(ROOT, "_dev", "samples", id);
mkdirSync(dir, { recursive: true });
const manifest = {
  characterId: id,
  face,
  variant,
  renderedAt: new Date().toISOString().slice(0, 10),
  seconds: Math.round((Date.now() - t0) / 1000),
  unitsCharged: units,
  steps: steps.map((s, n) => {
    let image = null;
    if (s.image) {
      const ext = sniffImageType(s.image.bytes) === "image/png" ? "png" : "jpg";
      image = `${n}-${s.kind}.${ext}`;
      writeFileSync(path.join(dir, image), s.image.bytes);
    }
    return { kind: s.kind, status: s.status, units: s.units, ms: s.ms, error: s.error || null, image };
  }),
};
writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\n${id}: ${steps.map((s) => `${s.kind}=${s.status}${s.error ? `(${s.error.code})` : ""}`).join(", ")}`);
console.log(`charged ${units} units (balance ${before} -> ${after}), app counted ${counted}, ${manifest.seconds}s`);
