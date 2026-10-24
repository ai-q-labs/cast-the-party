// The character data, the example tags and the shipped files, checked against
// what actually exists.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHARACTERS, PROPS, layersFor } from "../public/characters.js";
import { loadApiKey } from "../src/key.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const templates = new Set(JSON.parse(readFileSync(path.join(ROOT, "test", "fixtures", "hairstyle-templates.json"), "utf8")).ids);

test("six characters, each with both hairstyle sets drawn from YouCam's real template list", () => {
  assert.equal(CHARACTERS.length, 6);
  assert.equal(new Set(CHARACTERS.map((c) => c.id)).size, 6);
  for (const c of CHARACTERS) {
    assert.deepEqual(Object.keys(c.variants).sort(), ["female", "male"], c.id);
    for (const [g, v] of Object.entries(c.variants)) {
      assert.ok(templates.has(v.hairstyle), `${c.id}: ${v.hairstyle} is not a YouCam template`);
      assert.ok(v.hairstyle.startsWith(`${g}_`), `${c.id}: ${v.hairstyle} is filed under the other set`);
    }
    assert.match(c.hairColor.hex, /^#[0-9A-F]{6}$/);
    if (c.earrings) assert.ok(PROPS[c.earrings], c.id);
    if (c.hat) assert.ok(PROPS[c.hat.prop], c.id);
    const layers = layersFor(c);
    assert.ok(layers.length >= 3, `${c.id} combines at least three YouCam features`);
    for (const item of c.shopping) {
      assert.ok(item.item && item.q, c.id);
      if (item.layer) assert.ok(layers.includes(item.layer), `${c.id}: "${item.item}" points at a layer the look does not have`);
    }
  }
});

test("prop photos and demo faces exist", () => {
  for (const p of Object.values(PROPS)) assert.ok(existsSync(path.join(PUBLIC, p.file)), p.file);
  for (const f of ["face-a", "face-b", "face-c"]) assert.ok(existsSync(path.join(PUBLIC, "demo-faces", `${f}.jpg`)), f);
});

test("every character has an example tag that matches its look", () => {
  for (const c of CHARACTERS) {
    const dir = path.join(PUBLIC, "examples", c.id);
    const m = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
    assert.equal(m.characterId, c.id);
    assert.deepEqual(m.steps.map((s) => s.kind), layersFor(c), c.id);
    assert.ok(["face-a", "face-b", "face-c"].includes(m.face));
    assert.ok(m.unitsCharged > 0);
    for (const s of m.steps) if (s.image) assert.ok(existsSync(path.join(dir, s.image)), `${c.id}/${s.image}`);
  }
});

function shippedTextFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["_dev", "node_modules", ".git"].includes(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) shippedTextFiles(p, out);
    else if (/\.(m?js|json|html|css|md|log|txt|replit)$|^\.gitignore$|^LICENSE$/.test(name)) out.push(p);
  }
  return out;
}

test("no shipped file carries a local path or the API key", () => {
  const files = shippedTextFiles(ROOT);
  assert.ok(files.length > 15);
  const { key } = loadApiKey();
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const rel = path.relative(ROOT, f);
    assert.ok(!/[A-Za-z]:[\\/]+Users[\\/]/i.test(text), `${rel} contains a local Windows path`);
    assert.ok(!/\/c\/Users\//i.test(text), `${rel} contains a local path`);
    if (key) assert.ok(!text.includes(key), `${rel} contains the API key`);
  }
});
