// Free, read-only calls used while building: feature costs and template lists.
// They spend no units. Output goes to _dev/ (git-ignored), never the key.
//
//   node scripts/probe.mjs cost
//   node scripts/probe.mjs templates /s2s/v2.0/task/template/hair-style

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadApiKey } from "../src/key.js";
import { createYouCam } from "../src/youcam.js";

const out = fileURLToPath(new URL("../_dev/", import.meta.url));
mkdirSync(out, { recursive: true });
const { key } = loadApiKey();
if (!key) {
  console.error("No YouCam key found.");
  process.exit(1);
}
const yc = createYouCam({ apiKey: key, base: process.env.YOUCAM_API_BASE || undefined });
const [cmd, arg] = process.argv.slice(2);

async function pages(path) {
  const all = [];
  let token = "";
  for (let i = 0; i < 30; i++) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await yc.get(`${path}${sep}page_size=20${token ? `&starting_token=${encodeURIComponent(token)}` : ""}`);
    const data = r.data || r.result || {};
    all.push(...(data.templates || data.skus || []));
    token = data.next_token;
    if (!token) break;
  }
  return all;
}

if (cmd === "cost") {
  const skus = await pages("/s2s/v2.0/credit/feature-cost");
  writeFileSync(`${out}feature-cost.json`, JSON.stringify(skus, null, 2));
  for (const s of skus) console.log(`${s.amount}\t${s.unit}\t${s.run_task_url?.replace(/^https:\/\/[^/]+/, "")}\t${s.description}`);
} else if (cmd === "templates") {
  const list = await pages(arg);
  const name = arg.split("/").filter(Boolean).slice(-2).join("_");
  writeFileSync(`${out}templates_${name}.json`, JSON.stringify(list, null, 2));
  console.log(`${list.length} templates`);
  for (const t of list) console.log(`${t.id}\t${t.category_name || ""}\t${t.title || ""}`);
} else {
  console.error("usage: probe.mjs cost | templates <path>");
  process.exit(2);
}
