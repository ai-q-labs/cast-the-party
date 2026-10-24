// Where the YouCam API key comes from. It stays in this process: it is never
// logged, never written to disk by the app, and never sent to the browser.
//
//   YOUCAM_API_KEY       the key itself (use this on Replit: Secrets tab)
//   YOUCAM_SECRETS_DIR   a folder holding api_key.txt (local development)
//
// Without either, ~/.secrets/youcam/api_key.txt is tried. Without a key the app
// still serves the page and the sample costume cards; only live renders are off.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function loadApiKey(env = process.env) {
  const direct = (env.YOUCAM_API_KEY || "").trim();
  if (direct) return { key: direct, source: "env YOUCAM_API_KEY" };

  const dir = env.YOUCAM_SECRETS_DIR || path.join(homedir(), ".secrets", "youcam");
  const file = path.join(dir, "api_key.txt");
  if (existsSync(file)) {
    const key = readFileSync(file, "utf8").trim();
    if (key) return { key, source: "api_key.txt in the secrets folder" };
  }
  return { key: "", source: "none" };
}
