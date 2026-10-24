// The YouCam client against a mocked fetch: where the key goes, where it must
// not go, and how polling ends.

import test from "node:test";
import assert from "node:assert/strict";
import { createYouCam, YouCamError } from "../src/youcam.js";

const KEY = "test-key-not-real";

function mockFetch(script) {
  const seen = [];
  const fetch = async (url, init = {}) => {
    const u = String(url);
    seen.push({ url: u, method: init.method || "GET", headers: init.headers || {}, body: init.body });
    const reply = script(u, init, seen.length);
    return {
      ok: reply.status < 400,
      status: reply.status,
      headers: new Map([["content-type", reply.type || "application/json"]]),
      json: async () => reply.json,
      arrayBuffer: async () => new Uint8Array(reply.bytes || []).buffer,
    };
  };
  return { fetch, seen };
}

const auth = (h) => h.authorization || h.Authorization;

test("upload: the key goes to the API host only, the bytes go to storage without it", async () => {
  const { fetch, seen } = mockFetch((u) =>
    u.endsWith("/s2s/v2.0/file")
      ? { status: 200, json: { status: 200, data: { files: [{ file_id: "F1", requests: [{ url: "https://bucket.example/put?sig=1", method: "PUT", headers: { "Content-Type": "image/jpeg" } }] }] } } }
      : { status: 200, json: {} },
  );
  const yc = createYouCam({ apiKey: KEY, fetch });
  const id = await yc.upload(Buffer.from("abc"), { contentType: "image/jpeg", fileName: "a.jpg" });
  assert.equal(id, "F1");
  assert.equal(auth(seen[0].headers), `Bearer ${KEY}`);
  assert.deepEqual(JSON.parse(seen[0].body), { files: [{ content_type: "image/jpeg", file_name: "a.jpg", file_size: 3 }] });
  assert.equal(seen[1].url, "https://bucket.example/put?sig=1");
  assert.equal(seen[1].method, "PUT");
  assert.equal(auth(seen[1].headers), undefined, "no key on the storage upload");
  assert.equal(seen[1].headers["Content-Length"], "3");
});

test("run: polls until success and returns the result url", async () => {
  let polls = 0;
  const { fetch, seen } = mockFetch((u, init) => {
    if (init.method === "POST") return { status: 200, json: { status: 200, data: { task_id: "T/1" } } };
    polls += 1;
    return polls < 3
      ? { status: 200, json: { status: 200, data: { task_status: "running" } } }
      : { status: 200, json: { status: 200, data: { task_status: "success", results: { url: "https://bucket.example/r.png" } } } };
  });
  const yc = createYouCam({ apiKey: KEY, fetch, sleep: async () => {} });
  const r = await yc.run("/s2s/v2.0/task/hair-color", { src_file_id: "F1", preset: "Jet Black" });
  assert.equal(r.url, "https://bucket.example/r.png");
  assert.equal(r.polls, 3);
  assert.equal(seen[1].url, "https://yce-api-01.perfectcorp.com/s2s/v2.0/task/hair-color/T%2F1");
  assert.ok(seen.every((s) => auth(s.headers) === `Bearer ${KEY}`));
});

test("run: an engine error carries its code and the task id (it may have been charged)", async () => {
  const { fetch } = mockFetch((u, init) =>
    init.method === "POST"
      ? { status: 200, json: { data: { task_id: "T2" } } }
      : { status: 200, json: { data: { task_status: "error", error: "error_no_face" } } },
  );
  const yc = createYouCam({ apiKey: KEY, fetch, sleep: async () => {} });
  await assert.rejects(yc.run("/s2s/v2.0/task/hat", {}), (e) => e instanceof YouCamError && e.code === "error_no_face" && e.taskId === "T2");
});

test("run: a refused request has no task id", async () => {
  const { fetch } = mockFetch(() => ({ status: 400, json: { status: 400, error_code: "CreditInsufficiency" } }));
  const yc = createYouCam({ apiKey: KEY, fetch });
  await assert.rejects(yc.run("/s2s/v2.0/task/hat", {}), (e) => e.code === "CreditInsufficiency" && e.status === 400 && !e.taskId);
});

test("run: gives up after the timeout", async () => {
  const { fetch } = mockFetch((u, init) =>
    init.method === "POST" ? { status: 200, json: { data: { task_id: "T3" } } } : { status: 200, json: { data: { task_status: "running" } } },
  );
  const yc = createYouCam({ apiKey: KEY, fetch, sleep: async () => {}, timeoutMs: -1 });
  await assert.rejects(yc.run("/s2s/v2.0/task/hat", {}), (e) => e.code === "timeout" && e.taskId === "T3");
});

test("download sends no key; the client refuses to send the key to another host", async () => {
  const { fetch, seen } = mockFetch(() => ({ status: 200, bytes: [1, 2, 3], type: "binary/octet-stream" }));
  const yc = createYouCam({ apiKey: KEY, fetch });
  const d = await yc.download("https://bucket.example/r.png");
  assert.equal(d.bytes.length, 3);
  assert.equal(auth(seen[0].headers), undefined);
  await assert.rejects(yc.get("https://evil.example/s2s/v2.0/file"), /another host/);
  await assert.rejects(yc.get("//evil.example/x"), /another host/);
  assert.throws(() => createYouCam({ apiKey: "" }), /apiKey/);
});
