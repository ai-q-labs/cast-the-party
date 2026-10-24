// A stand-in for src/youcam.js: same four methods, no network, no key.
// It records every call so tests can check what would have been sent.

export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
export const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);

export function fakeYouCam({ failOn = {}, refuseOn = {} } = {}) {
  const calls = { upload: [], run: [], download: [] };
  let n = 0;
  return {
    calls,
    async upload(bytes, opts) {
      calls.upload.push({ size: bytes.length, ...opts });
      return `file-${calls.upload.length}`;
    },
    async run(taskPath, payload) {
      calls.run.push({ taskPath, payload });
      const kind = taskPath.split("/task/")[1];
      if (refuseOn[kind]) {
        const e = new Error("refused");
        e.code = refuseOn[kind];
        throw e; // refused before a task existed: no taskId
      }
      if (failOn[kind]) {
        const e = new Error("engine error");
        e.code = failOn[kind];
        e.taskId = `task-${++n}`;
        throw e;
      }
      return { taskId: `task-${++n}`, url: `https://storage.example/result-${n}?sig=x`, polls: 1 };
    },
    async download(url) {
      calls.download.push(url);
      return { bytes: url.includes("result-1?") ? JPG : PNG, type: "binary/octet-stream" };
    },
    async get() {
      return {};
    },
  };
}
