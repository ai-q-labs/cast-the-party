// A small client for the YouCam API (Perfect Corp.), the four calls this app
// needs and nothing else:
//
//   upload(bytes)            POST /s2s/v2.0/file, then PUT the bytes to the
//                            presigned URL it returns       -> file_id
//   run(taskPath, payload)   POST <taskPath>, then poll GET <taskPath>/<task_id>
//                            until task_status is success or error -> result url
//   download(url)            GET the result (a presigned link, valid 2 hours)
//   get(path)                any other GET (templates, feature costs)
//
// The key goes only into the Authorization header of calls to the API host.
// The presigned upload and download URLs are on a storage host and get no
// Authorization header: they carry their own signature, and the key has no
// business leaving for a third host.

export const DEFAULT_BASE = "https://yce-api-01.perfectcorp.com";

export class YouCamError extends Error {
  constructor(message, { status = 0, code = "", taskStatus = "", taskId = "" } = {}) {
    super(message);
    this.name = "YouCamError";
    this.status = status;
    this.code = code;
    this.taskStatus = taskStatus;
    this.taskId = taskId; // set once a task was accepted, i.e. it may have been charged
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createYouCam({
  apiKey,
  base = DEFAULT_BASE,
  fetch = globalThis.fetch,
  sleep = wait,
  pollMs = 2500,
  timeoutMs = 240_000,
} = {}) {
  if (!apiKey) throw new Error("createYouCam needs an apiKey");
  const origin = new URL(base).origin;

  async function api(method, path, body) {
    const url = new URL(path, origin);
    if (url.origin !== origin) throw new Error("refusing to send the key to another host");
    const res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) {
      const code = json?.error_code || json?.error || "";
      throw new YouCamError(`YouCam ${method} ${url.pathname} -> ${res.status} ${code}`.trim(), {
        status: res.status,
        code,
      });
    }
    return json;
  }

  async function upload(bytes, { contentType = "image/jpeg", fileName = "photo.jpg" } = {}) {
    const meta = await api("POST", "/s2s/v2.0/file", {
      files: [{ content_type: contentType, file_name: fileName, file_size: bytes.length }],
    });
    const file = meta?.data?.files?.[0];
    const req = file?.requests?.[0];
    if (!file?.file_id || !req?.url) throw new YouCamError("YouCam file API returned no upload URL");
    const put = await fetch(req.url, {
      method: req.method || "PUT",
      headers: { ...(req.headers || {}), "Content-Type": contentType, "Content-Length": String(bytes.length) },
      body: bytes,
    });
    if (!put.ok) throw new YouCamError(`upload to storage failed (${put.status})`, { status: put.status });
    return file.file_id;
  }

  async function run(taskPath, payload, { onPoll } = {}) {
    const started = await api("POST", taskPath, payload);
    const taskId = started?.data?.task_id;
    if (!taskId) throw new YouCamError(`YouCam ${taskPath} returned no task_id`);
    const deadline = Date.now() + timeoutMs;
    let polls = 0;
    try {
      for (;;) {
        await sleep(pollMs);
        polls += 1;
        const s = await api("GET", `${taskPath}/${encodeURIComponent(taskId)}`);
        const status = s?.data?.task_status;
        onPoll?.(status, polls);
        if (status === "success") {
          const url = s?.data?.results?.url || s?.data?.results?.[0]?.url || s?.data?.result?.url;
          if (!url) throw new YouCamError(`${taskPath} succeeded without a result url`, { taskStatus: status });
          return { taskId, url, polls, data: s.data };
        }
        if (status === "error") {
          const code = s?.data?.error || "error";
          throw new YouCamError(`${taskPath}: ${code}${s?.data?.error_message ? ` (${s.data.error_message})` : ""}`, {
            code,
            taskStatus: status,
          });
        }
        if (Date.now() > deadline) throw new YouCamError(`${taskPath}: timed out after ${polls} polls`, { code: "timeout" });
      }
    } catch (err) {
      if (err instanceof YouCamError) err.taskId = taskId;
      throw err;
    }
  }

  async function download(url) {
    const res = await fetch(url);
    if (!res.ok) throw new YouCamError(`result download failed (${res.status})`, { status: res.status });
    const type = res.headers.get("content-type") || "image/jpeg";
    return { bytes: Buffer.from(await res.arrayBuffer()), type };
  }

  const get = (path) => api("GET", path);

  return { upload, run, download, get };
}
