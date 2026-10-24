// Runs one guest's look: upload the photo once, then apply the layers in order,
// each on the previous layer's result. A layer that fails is recorded and
// skipped, and the next layer starts from the last good image, so one missing
// piece (say, earrings on hidden ears) does not cost the guest the whole card.
//
// The hat engine composes a new picture (outfit, background, framing), so it
// runs last, on the finished face card, and is reported as a separate portrait.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PROPS, UNITS } from "../public/characters.js";
import { TASK_PATHS, buildRequest } from "./plan.js";

const FRIENDLY = {
  error_no_face: "No face was found in the photo.",
  error_multiple_people: "More than one person is in the photo.",
  error_large_face_angle: "The face is turned too far; use a straight-on photo.",
  error_face_pose: "The head is tilted too far; use a straight-on photo.",
  error_hair_too_short: "The hair in the photo is too short for this style.",
  error_bald_image: "This style needs some hair in the photo to work from.",
  error_no_shoulder: "Shoulders need to be visible in the photo.",
  error_below_min_image_size: "The photo is too small.",
  error_exceed_max_image_size: "The photo is too large.",
  error_nsfw_content_detected: "The photo was refused by YouCam's content check.",
  error_insufficient_landmarks: "The face or shoulders could not be found clearly.",
  CreditInsufficiency: "The demo has run out of YouCam units for now.",
  timeout: "YouCam did not finish in time.",
};

export function friendlyError(err) {
  const code = err?.code || "";
  return { code: code || "error", message: FRIENDLY[code] || "YouCam could not apply this layer to this photo." };
}

// Uploads the hat and earring product photos once and reuses their file ids.
// YouCam keeps uploaded files for 30 days; we refresh after 20.
export function createPropStore(yc, publicDir, { maxAgeMs = 20 * 24 * 3600 * 1000, now = Date.now } = {}) {
  const cache = new Map();
  return async function propIds(keys) {
    const out = {};
    for (const key of keys) {
      const hit = cache.get(key);
      if (hit && now() - hit.at < maxAgeMs) {
        out[key] = hit.fileId;
        continue;
      }
      const prop = PROPS[key];
      if (!prop) throw new Error(`unknown prop ${key}`);
      const bytes = await readFile(path.join(publicDir, prop.file));
      const fileId = await yc.upload(bytes, { contentType: "image/jpeg", fileName: path.basename(prop.file) });
      cache.set(key, { fileId, at: now() });
      out[key] = fileId;
    }
    return out;
  };
}

export function propsNeeded(character, layers) {
  const keys = [];
  if (layers.includes("earrings") && character.earrings) keys.push(character.earrings);
  if (layers.includes("hat") && character.hat) keys.push(character.hat.prop);
  return keys;
}

// job: { character, variant, layers, photo: Buffer }
// Each step ends as { kind, status: "done"|"failed"|"skipped", units, ms, error?, image?: {bytes,type} }
export async function runLook(yc, job, { propIds, onChange = () => {}, clock = Date.now } = {}) {
  const steps = job.layers.map((kind) => ({ kind, status: "waiting", units: 0, ms: 0 }));
  const emit = () => onChange(steps);
  emit();

  const fileId = await yc.upload(job.photo, { contentType: "image/jpeg", fileName: "guest.jpg" });
  const ids = await propIds(propsNeeded(job.character, job.layers));

  let src = { fileId };
  for (const step of steps) {
    step.status = "running";
    emit();
    const t0 = clock();
    try {
      const req = buildRequest(step.kind, job.character, job.variant, src, ids);
      const r = await yc.run(TASK_PATHS[step.kind], req);
      step.units = UNITS[step.kind];
      step.image = await yc.download(r.url);
      step.status = "done";
      // The hat portrait is a new composition; the face card stays the base.
      if (step.kind !== "hat") src = { url: r.url };
    } catch (err) {
      step.status = "failed";
      // A task YouCam accepted may be charged even if it then fails, so it is
      // counted; a request refused before a task existed is not.
      step.units = err?.taskId ? UNITS[step.kind] : 0;
      step.error = friendlyError(err);
    }
    step.ms = clock() - t0;
    emit();
  }
  return steps;
}
