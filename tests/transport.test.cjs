"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create } = require("../src/fetch-transport.js");
const input = "https://1shortlink.com/link-encrypted/fixture";

test("transport enforces endpoint boundaries before fetching", async () => {
  let calls = 0; const request = create(async () => { calls++; });
  for (const url of ["https://1shortlink.com/account/delete", "https://other.example/get-link-download"]) {
    await assert.rejects(request(url, { method: "POST" }), { code: "REQUEST_DENIED" });
  }
  assert.equal(calls, 0);
});
test("transport cancellation aborts an in-flight request", async () => {
  const controller = new AbortController();
  const request = create((_url, config) => new Promise((_resolve, reject) => config.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
  const pending = request(input, { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, { name: "AbortError" });
});
test("request timeout is distinct from user cancellation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const request = create((_url, config) => new Promise((_resolve, reject) => config.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
  const pending = request(input); t.mock.timers.tick(15000);
  await assert.rejects(pending, { code: "TIMEOUT" });
});
test("oversized streamed responses are cancelled at the body limit", async () => {
  let cancelled = false;
  const request = create(async () => ({ status: 200, url: input, body: { getReader: () => ({ async read() { return { done: false, value: new Uint8Array(1048577) }; }, async cancel() { cancelled = true; } }) } }));
  await assert.rejects(request(input), { code: "RESPONSE_TOO_LARGE" }); assert.equal(cancelled, true);
});
