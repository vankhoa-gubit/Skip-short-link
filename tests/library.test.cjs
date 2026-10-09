"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Library = require("../src/library.js");
const destination = "https://gofile.io/d/fixture?sig=a%2Bb%3D&part=2#download";
const result = { phase: "resolved", message: "Found", url: destination, code: null };
function harness(initial = {}, historyStore) {
  const data = structuredClone(initial); let failure = false;
  const storage = { async get(keys) { if (typeof keys === "string") return { [keys]: structuredClone(data[keys]) }; return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, data[key] ?? fallback])); }, async set(patch) { if (failure) throw new Error("Storage full"); Object.assign(data, structuredClone(patch)); } };
  return { library: Library.create(storage, historyStore), data, fail(value) { failure = value; } };
}
test("0.3 auto-open preference migrates while app defaults and ad preferences are preserved", async () => {
  const h = harness({ autoOpen: true, adFilters: { "1short": false } });
  assert.deepEqual(await h.library.getSettings(), { autoOpen: true, saveHistory: true, historyLimit: 100, batchDelayMs: 1000 });
  await h.library.setSettings({ historyLimit: 25 }); assert.equal(h.data.autoOpen, true); assert.deepEqual(h.data.adFilters, { "1short": false });
  await assert.rejects(h.library.setSettings({ historyLimit: 10000 }), { code: "INVALID_SETTINGS" });
  await assert.rejects(h.library.setSettings({ saveHistory: "true" }), { code: "INVALID_SETTINGS" });
});
test("history persists the signed destination and redacted source only, including manual/error records", async () => {
  const h = harness(); const input = "https://1shortlink.com/api/v1/full-pages?api_key=private-fixture&url=payload";
  await h.library.record(input, result);
  await h.library.record("https://1shortlink.com/link-encrypted/private-cipher", { phase: "manual", message: "Verify", url: input, code: "NEEDS_VERIFICATION" });
  await h.library.record(input, { phase: "error", message: "Expired", url: input, code: "EXPIRED_LINK" });
  assert.equal(h.data.history.length, 3); assert.equal(h.data.history.find((entry) => entry.phase === "resolved").url, destination);
  assert.ok(!JSON.stringify(h.data).includes("private-fixture")); assert.ok(!JSON.stringify(h.data).includes("private-cipher"));
  assert.ok(!JSON.stringify(h.data).includes('"sourceUrl"')); assert.equal(h.data.history.find((entry) => entry.phase === "manual").url, null);
});
test("concurrent completions serialize; changing retention prunes and individual deletion/clear work", async () => {
  const h = harness(); await Promise.all(Array.from({ length: 30 }, (_, index) => h.library.record("https://ez4short.com/alias-" + index, result)));
  assert.equal(h.data.history.length, 30); assert.equal(new Set(h.data.history.map(({ id }) => id)).size, 30);
  await h.library.setSettings({ historyLimit: 25 }); assert.equal(h.data.history.length, 25);
  await h.library.removeHistory(h.data.history[0].id); assert.equal(h.data.history.length, 24);
  await h.library.clearHistory(); assert.deepEqual(await h.library.getHistory(), []);
});
test("disabling history prevents future writes without deleting existing data; errors leave the queue usable", async () => {
  const h = harness(); await h.library.record("https://ez4short.com/first", result);
  await h.library.setSettings({ saveHistory: false }); await h.library.record("https://ez4short.com/second", result); assert.equal(h.data.history.length, 1);
  await h.library.setSettings({ saveHistory: true }); h.fail(true);
  await assert.rejects(h.library.record("https://ez4short.com/third", result), { code: "HISTORY_SAVE_FAILED" });
  h.fail(false); await h.library.record("https://ez4short.com/fourth", result); assert.equal(h.data.history.length, 2);
});
test("corrupted stored history cannot expose script URLs, unsupported destinations or source payload properties", async () => {
  const good = { id: "good", createdAt: 1, sourceLabel: "ez4short.com/fixture", ...result, sourceUrl: "private-source" };
  const normalized = Library.normalizeHistory([good, { ...good, id: "script", url: "javascript:alert(1)" }, { ...good, id: "foreign", url: "https://evil.example/" }, null]);
  assert.equal(normalized.length, 1); assert.equal(normalized[0].sourceUrl, undefined); assert.equal(normalized[0].url, destination);
});
test("sharded GM history trims beyond 250 without losing other tabs' appends", async () => {
  const records = new Map(); const historyStore = { async list() { return [...records.values()]; }, async append(entry) { records.set(entry.id, entry); }, async remove(id) { records.delete(id); } };
  const a = harness({ appSettings: { historyLimit: 250 } }, historyStore); const b = harness({ appSettings: { historyLimit: 250 } }, historyStore);
  await Promise.all(Array.from({ length: 252 }, (_, index) => (index % 2 ? a : b).library.record("https://ez4short.com/alias-" + index, result)));
  assert.equal(records.size, 250); assert.equal((await a.library.getHistory()).length, 250);
  await a.library.clearHistory(); assert.equal(records.size, 0);
});
