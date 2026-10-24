// What gets sent to YouCam for a look, in what order, and what a failure costs.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHARACTERS, UNITS } from "../public/characters.js";
import { TASK_PATHS, buildRequest, chooseLayers, findCharacter, plannedUnits } from "../src/plan.js";
import { createPropStore, friendlyError, propsNeeded, runLook } from "../src/pipeline.js";
import { fakeYouCam } from "./fake-youcam.mjs";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const editor = findCharacter("night-editor");

async function render(yc, character, variant = "female", skip = []) {
  const layers = chooseLayers(character, skip);
  return runLook(yc, { character, variant, layers, photo: Buffer.from([0xff, 0xd8, 0xff]) }, { propIds: createPropStore(yc, PUBLIC) });
}

test("a full look chains each layer on the previous result, hat last on the finished face", async () => {
  const yc = fakeYouCam();
  const steps = await render(yc, editor);
  assert.deepEqual(
    steps.map((s) => [s.kind, s.status]),
    [["hairstyle", "done"], ["hairColor", "done"], ["makeup", "done"], ["earrings", "done"], ["hat", "done"]],
  );
  const runs = yc.calls.run;
  assert.deepEqual(runs.map((r) => r.taskPath), [TASK_PATHS.hairstyle, TASK_PATHS.hairColor, TASK_PATHS.makeup, TASK_PATHS.earrings, TASK_PATHS.hat]);
  assert.equal(runs[0].payload.src_file_id, "file-1", "the guest photo is uploaded once and used by file id");
  assert.equal(runs[1].payload.src_file_url, "https://storage.example/result-1?sig=x");
  assert.equal(runs[2].payload.src_file_url, "https://storage.example/result-2?sig=x");
  assert.equal(runs[3].payload.src_file_url, "https://storage.example/result-3?sig=x");
  assert.equal(runs[4].payload.src_file_url, "https://storage.example/result-4?sig=x", "hat runs on the finished face card");
  assert.equal(yc.calls.upload.length, 3, "photo + earring prop + hat prop");
  assert.equal(steps.reduce((s, x) => s + x.units, 0), 6);
});

test("request shapes follow the YouCam reference", () => {
  const src = { fileId: "F" };
  const props = { "earring-pearl": "E1", "hat-newsboy": "H1" };
  assert.deepEqual(buildRequest("hairstyle", editor, "male", src, props), { src_file_id: "F", template_id: "male_modern_slick_back" });
  const hc = buildRequest("hairColor", editor, "female", { url: "U" }, props);
  assert.deepEqual(hc.pattern, { name: "full" });
  assert.equal(hc.palettes[0].color, "#1B1717");
  const mu = buildRequest("makeup", editor, "female", src, props);
  assert.equal(mu.version, "1.0");
  assert.deepEqual(mu.effects[0], { category: "skin_smooth", skinSmoothStrength: 0, skinSmoothColorIntensity: 0 });
  assert.ok(mu.effects.some((e) => e.category === "lip_color" && e.palettes[0].color === "#7A1F3D"));
  const er = buildRequest("earrings", editor, "female", { url: "U" }, props);
  assert.deepEqual(er.ref_file_ids, ["E1"]);
  assert.equal(er.source_info.name, "U");
  assert.equal(er.object_infos[0].name, "E1", "object_infos names the same reference as ref_file_ids");
  const hat = buildRequest("hat", editor, "male", src, props);
  assert.deepEqual(hat, { src_file_id: "F", ref_file_id: "H1", gender: "male", style: "style_urban_fashion" });
  assert.throws(() => buildRequest("earrings", editor, "female", src, {}), /no uploaded file/);
  assert.throws(() => buildRequest("hairstyle", editor, "other", src, props), /unknown variant/);
});

test("a failed layer is skipped and the next one starts from the last good image", async () => {
  const yc = fakeYouCam({ failOn: { "hair-color": "error_inference" } });
  const steps = await render(yc, editor);
  const hc = steps.find((s) => s.kind === "hairColor");
  assert.equal(hc.status, "failed");
  assert.equal(hc.error.code, "error_inference");
  assert.equal(hc.units, UNITS.hairColor, "an accepted task that then fails is still counted");
  const makeup = yc.calls.run.find((r) => r.taskPath === TASK_PATHS.makeup);
  assert.equal(makeup.payload.src_file_url, "https://storage.example/result-1?sig=x", "makeup ran on the hairstyle result");
  assert.equal(steps.filter((s) => s.status === "done").length, 4);
});

test("a request refused before a task existed costs nothing", async () => {
  const yc = fakeYouCam({ refuseOn: { "2d-vto/earring": "InvalidParameters" } });
  const steps = await render(yc, editor);
  const er = steps.find((s) => s.kind === "earrings");
  assert.equal(er.status, "failed");
  assert.equal(er.units, 0);
  assert.equal(steps.reduce((s, x) => s + x.units, 0), 5);
});

test("switched-off layers are not sent, and the hairstyle cannot be switched off", async () => {
  const layers = chooseLayers(editor, ["hat", "earrings", "hairstyle", "nonsense"]);
  assert.deepEqual(layers, ["hairstyle", "hairColor", "makeup"]);
  assert.equal(plannedUnits(layers), 3);
  assert.deepEqual(propsNeeded(editor, layers), []);
  const yc = fakeYouCam();
  await render(yc, editor, "female", ["hat", "earrings"]);
  assert.equal(yc.calls.upload.length, 1, "no prop uploads for switched-off layers");
  assert.equal(yc.calls.run.length, 3);
});

test("prop photos are uploaded once and reused until they near YouCam's 30-day limit", async () => {
  const yc = fakeYouCam();
  let t = 0;
  const store = createPropStore(yc, PUBLIC, { now: () => t });
  const a = await store(["earring-pearl"]);
  const b = await store(["earring-pearl"]);
  assert.equal(a["earring-pearl"], b["earring-pearl"]);
  assert.equal(yc.calls.upload.length, 1);
  t = 21 * 24 * 3600 * 1000;
  await store(["earring-pearl"]);
  assert.equal(yc.calls.upload.length, 2, "re-uploaded after 20 days");
});

test("errors shown to guests are plain sentences, never raw codes", () => {
  assert.match(friendlyError({ code: "error_no_face" }).message, /No face/);
  assert.match(friendlyError({ code: "CreditInsufficiency" }).message, /out of YouCam units/);
  assert.match(friendlyError({ code: "something_new" }).message, /could not apply/);
});

test("every character's look runs on both hairstyle sets", async () => {
  for (const ch of CHARACTERS) {
    for (const variant of Object.keys(ch.variants)) {
      const steps = await render(fakeYouCam(), ch, variant);
      assert.ok(steps.every((s) => s.status === "done"), `${ch.id}/${variant}`);
    }
  }
});
