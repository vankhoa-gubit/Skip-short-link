"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Batch = require("../src/batch.js");
const target = "https://gofile.io/d/fixture?sig=a%2Bb%3D#file";
const result = { phase: "resolved", url: target, message: "Found", code: null };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function harness(options = {}) {
  const data = options.data || {}; const completions = []; const changes = [];
  const storage = { async get(key) { return { [key]: structuredClone(data[key]) }; }, async set(value) { Object.assign(data, structuredClone(value)); } };
  const batch = Batch.create({ storage, getSettings: async () => ({ batchDelayMs: 500 }), wait: options.wait || (async () => {}), resolve: options.resolve || (async () => result), onResult: options.onResult || (async (url) => completions.push(url)), onState: (state) => changes.push(state) });
  return { batch, data, completions, changes };
}
async function until(h, predicate) { for (let attempt = 0; attempt < 200; attempt++) { const state = await h.batch.get(); if (predicate(state)) return state; await tick(); } throw new Error("Queue did not reach expected state"); }
test("batch parser preserves signed inputs, deduplicates exact URLs and rejects invalid lines without storing their text", () => {
  const parsed = Batch.parse(target + "\n" + target + "\nhttps://user:password@1shortlink.com/ll/fixture\nhttps://evil.example/");
  assert.equal(parsed.duplicates, 1); assert.equal(parsed.entries.length, 3); assert.equal(parsed.entries[0].sourceUrl, target);
  assert.equal(parsed.entries[1].phase, "error"); assert.ok(!JSON.stringify(parsed).includes("password"));
  assert.throws(() => Batch.parse(""), { code: "BATCH_LIMIT" }); assert.throws(() => Batch.parse(Array(51).fill(target).join("\n")), { code: "BATCH_LIMIT" });
});
test("queue resolves one URL at a time, records real outcomes and does not request invalid entries", async () => {
  let inFlight = 0; let max = 0; const calls = [];
  const h = harness({ resolve: async (entry) => { inFlight++; max = Math.max(max, inFlight); calls.push(entry.sourceUrl); await tick(); inFlight--; return result; } });
  await h.batch.start("https://ez4short.com/one\ninvalid\nhttps://ez4short.com/two");
  const state = await until(h, (value) => value.phase === "complete");
  assert.equal(max, 1); assert.equal(calls.length, 2); assert.equal(h.completions.length, 2);
  assert.deepEqual(state.entries.map(({ phase }) => phase), ["resolved", "error", "resolved"]);
  assert.ok(h.changes.every((state, index) => !index || state.revision > h.changes[index - 1].revision));
});
test("Stop aborts a request and a late result cannot overwrite a new queue or enter history", async () => {
  let release; let signal;
  const h = harness({ resolve: async (entry, config) => { if (entry.sourceUrl.endsWith("old")) { signal = config.signal; return new Promise((resolve) => { release = resolve; }); } return result; } });
  await h.batch.start("https://ez4short.com/old\nhttps://ez4short.com/waiting"); await until(h, () => !!release);
  await h.batch.stop(); assert.equal(signal.aborted, true);
  await h.batch.start("https://ez4short.com/new"); await until(h, (state) => state.phase === "complete");
  release(result); await tick(); assert.equal(h.data.batch.entries[0].sourceUrl, "https://ez4short.com/new"); assert.deepEqual(h.completions, ["https://ez4short.com/new"]);
});
test("Stop during inter-link delay starts no more requests; resume keeps completed results", async () => {
  let waiting = false; const calls = [];
  const h = harness({ wait: async (_ms, signal) => { waiting = true; if (signal.aborted) throw new DOMException("Aborted", "AbortError"); await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })); }, resolve: async (entry) => { calls.push(entry.sourceUrl); return result; } });
  await h.batch.start("https://ez4short.com/one\nhttps://ez4short.com/two"); await until(h, () => waiting); await h.batch.stop(); await tick(); assert.equal(calls.length, 1);
  const restarted = harness({ data: h.data, resolve: async (entry) => { calls.push(entry.sourceUrl); return result; } });
  await restarted.batch.resume(); const state = await until(restarted, (value) => value.phase === "complete"); assert.equal(calls.length, 2); assert.equal(state.entries[0].phase, "resolved");
});
test("worker reconstruction marks unfinished rows interrupted and can resume from session state", async () => {
  const h = harness({ data: { batch: { phase: "running", revision: 10, entries: [{ id: 1, phase: "resolved", sourceUrl: target, url: target }, { id: 2, phase: "resolving", sourceUrl: "https://ez4short.com/unfinished", url: target }] } } });
  const interrupted = await h.batch.get(); assert.equal(interrupted.phase, "stopped"); assert.equal(interrupted.entries[1].code, "SESSION_INTERRUPTED"); assert.equal(interrupted.entries[1].url, null); assert.equal(interrupted.entries[0].url, target);
  await h.batch.resume(); await until(h, (state) => state.phase === "complete"); assert.deepEqual(h.completions, ["https://ez4short.com/unfinished"]);
});
test("rate limiting pauses remaining rows; manual/error results do not invent destinations", async () => {
  let first = true;
  const h = harness({ resolve: async () => { if (first) { first = false; return { phase: "error", code: "RATE_LIMITED", url: "https://ez4short.com/one", message: "Wait" }; } return { phase: "manual", code: "EZ4_ALIAS", url: "https://ez4short.com/two", message: "Verify" }; } });
  await h.batch.start("https://ez4short.com/one\nhttps://ez4short.com/two"); let state = await until(h, (value) => value.phase === "paused"); assert.equal(state.entries[1].phase, "queued"); assert.equal(h.completions.length, 1);
  await h.batch.resume(); state = await until(h, (value) => value.phase === "complete"); assert.equal(state.entries[1].phase, "manual"); assert.equal(state.entries[0].code, "RATE_LIMITED");
});
test("retry accepts fresh manual context, records the original source and preserves other rows", async () => {
  const h = harness({ resolve: async (entry) => entry.startUrl === "https://ez4short.com/fresh" ? result : { phase: "manual", code: "EZ4_ALIAS", message: "Verify", url: entry.sourceUrl } });
  await h.batch.start("https://ez4short.com/original"); await until(h, (state) => state.phase === "complete");
  await h.batch.attachTab(1, 99); await h.batch.retry(1, { startUrl: "https://ez4short.com/fresh", readTabId: 99 });
  const state = await until(h, (value) => value.phase === "complete" && value.entries[0].phase === "resolved"); assert.equal(state.entries[0].manualTabId, 99); assert.equal(state.entries[0].sourceUrl, "https://ez4short.com/original");
  assert.deepEqual(h.completions, ["https://ez4short.com/original", "https://ez4short.com/original"]);
});
test("history failure keeps a successful destination and reports the save limitation", async () => {
  const h = harness({ onResult: async () => { throw Object.assign(new Error("History unavailable"), { code: "HISTORY_SAVE_FAILED" }); } });
  await h.batch.start(target); const state = await until(h, (value) => value.phase === "complete"); assert.equal(state.entries[0].url, target); assert.equal(state.historyWarning, "History unavailable");
});
