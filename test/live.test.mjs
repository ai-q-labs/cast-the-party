// One real call to YouCam, off by default. It spends 1 unit.
//
//   YOUCAM_LIVE_TEST=1 YOUCAM_API_KEY=... npm run test:live
//
// Renders the Station Master's hairstyle (1 unit) on demo face A and checks a
// real image comes back. The rest of the suite never touches the network.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApiKey } from "../src/key.js";
import { createYouCam } from "../src/youcam.js";
import { TASK_PATHS, buildRequest, findCharacter } from "../src/plan.js";
import { sniffImageType } from "../src/app.js";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const on = process.env.YOUCAM_LIVE_TEST === "1";

test("live: one hairstyle render on a demo face", { skip: !on && "set YOUCAM_LIVE_TEST=1 to spend 1 unit" }, async () => {
  const { key } = loadApiKey();
  assert.ok(key, "no YouCam key");
  const yc = createYouCam({ apiKey: key });
  const fileId = await yc.upload(readFileSync(path.join(PUBLIC, "demo-faces", "face-a.jpg")), { contentType: "image/jpeg", fileName: "face-a.jpg" });
  const req = buildRequest("hairstyle", findCharacter("station-master"), "female", { fileId });
  const r = await yc.run(TASK_PATHS.hairstyle, req);
  const img = await yc.download(r.url);
  assert.ok(img.bytes.length > 10_000);
  assert.equal(sniffImageType(img.bytes), "image/jpeg");
});
