"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const input = "https://1shortlink.com/link-encrypted/fixture";
const destination = "https://vexfile.com/download/fixture?sig=a%2Fb%2Bc%3D&part=2";
const st = "https://ez4short.com/st?api=fixture&url=" + destination;
const tick = () => new Promise((resolve) => setImmediate(resolve));
function event() { const listeners = []; return { addListener(fn) { listeners.push(fn); }, emit(...args) { for (const fn of listeners) fn(...args); }, listeners }; }
function response(url, body = "", status = 200) { const reply = new Response(body, { status }); Object.defineProperty(reply, "url", { value: url }); return reply; }
function harness(options = {}) {
  const session = options.session || {};
  const local = options.local || {};
  const tabs = new Map([[1, { id: 1, url: input }], [2, { id: 2, url: "https://example.org/" }]]);
  const opened = []; const navigated = []; const requests = [];
  const area = (data) => ({
    async get(keys) {
      if (keys === null) return structuredClone(data);
      if (typeof keys === "string") return data[keys] === undefined ? {} : { [keys]: structuredClone(data[keys]) };
      return Object.fromEntries(Object.entries(keys).map(([key, value]) => [key, data[key] ?? value]));
    },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(key) { delete data[key]; }
  });
  const chrome = {
    runtime: { id: "qa", getURL: (file) => "chrome-extension://qa/" + file, onMessage: event() },
    storage: { session: area(session), local: area(local) },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
    webNavigation: { onBeforeNavigate: event() },
    tabs: {
      onUpdated: event(), onRemoved: event(),
      async get(id) { if (!tabs.has(id)) throw new Error("Tab missing"); return { ...tabs.get(id) }; },
      async create(config) { const tab = { id: 10 + opened.length, ...config }; opened.push(tab); tabs.set(tab.id, tab); return tab; },
      async update(id, config) { navigated.push({ id, ...config }); Object.assign(tabs.get(id), config); return tabs.get(id); },
      async sendMessage(id, message) { if (message.type === "ADSKIP_PAGE_HINTS") return options.hints ? options.hints(id) : null; }
    }
  };
  const context = vm.createContext({ chrome, URL, URLSearchParams, AbortController, DOMException, TextDecoder, atob, setTimeout, clearTimeout,
    fetch: async (url, config) => { requests.push({ url, method: config.method }); if (options.fetch) return options.fetch(url, config); throw new Error("No network expected"); }
  });
  context.importScripts = (...files) => { for (const file of files) vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension", file), "utf8"), context); };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/background.js"), "utf8"), context);
  const extension = { id: "qa", url: "chrome-extension://qa/popup.html" };
  const content = (id = 1) => ({ id: "qa", url: tabs.get(id).url, tab: { ...tabs.get(id) } });
  const send = (message, sender = extension) => new Promise((resolve, reject) => {
    try {
      let responded = false;
      const keepAlive = chrome.runtime.onMessage.listeners[0](message, sender, (reply) => { responded = true; resolve(reply); });
      if (keepAlive !== true && !responded) resolve(undefined);
    } catch (error) { reject(error); }
  });
  return { send, session, tabs, opened, navigated, requests, chrome, content };
}
async function until(predicate) { for (let count = 0; count < 100; count++) { if (predicate()) return; await tick(); } throw new Error("Background state did not arrive"); }

test("pasted signed /st resolves without a tab, a network request, or auto-navigation", async () => {
  const h = harness({ local: { autoOpen: true } });
  const result = await h.send({ type: "ADSKIP_RESOLVE", source: "input", url: st });
  assert.equal(result.state.url, destination); assert.equal(h.session.input.sourceUrl, st);
  assert.equal(h.requests.length, 0); assert.equal(h.navigated.length, 0); assert.equal(h.session["tab:2"], undefined);
});
test("invalid or unsupported pasted inputs never reach the transport", async () => {
  const h = harness();
  for (const url of ["javascript:alert(1)", "https://user:pass@1shortlink.com/ll/x", "https://1shortlink.com.evil.example/ll/x", "https://1shortlink.com:444/ll/x", ""]) {
    assert.ok((await h.send({ type: "ADSKIP_RESOLVE", source: "input", url })).error);
  }
  assert.equal(h.requests.length, 0); assert.equal(h.session.input, undefined);
});
test("content scripts cannot access input jobs or spoof another tab", async () => {
  const h = harness();
  assert.ok((await h.send({ type: "ADSKIP_GET", source: "input" }, h.content())).error);
  const result = await h.send({ type: "ADSKIP_RESOLVE", tabId: 2, hints: { initialCandidate: st } }, h.content());
  assert.equal(result.state.phase, "resolved"); assert.equal(h.session["tab:1"].url, destination);
  assert.equal(h.session["tab:2"], undefined);
});
test("popup restoration and input state remain independent of the selected tab", async () => {
  const h = harness();
  await h.send({ type: "ADSKIP_RESOLVE", source: "input", url: st });
  const restored = await h.send({ type: "ADSKIP_GET", tabId: 2, restore: true });
  assert.equal(restored.source, "input"); assert.equal(restored.state.url, destination);
  const tab = await h.send({ type: "ADSKIP_GET", tabId: 2 });
  assert.equal(tab.source, "tab"); assert.equal(tab.state.phase, "idle");
});
test("worker restart immediately persists an interrupted state for both sources", async () => {
  const session = {
    input: { phase: "resolving", sourceUrl: st, url: destination, updatedAt: Date.now(), steps: [] },
    "tab:1": { phase: "resolving", sourceUrl: input, updatedAt: Date.now(), steps: [] }
  };
  const h = harness({ session });
  for (const extra of [{ source: "input" }, { tabId: 1 }]) {
    const reply = await h.send({ type: "ADSKIP_GET", ...extra });
    assert.equal(reply.state.code, "SESSION_INTERRUPTED"); assert.equal(reply.state.phase, "stopped"); assert.equal(reply.state.url, null);
  }
  assert.equal(session.input.phase, "stopped"); assert.equal(session["tab:1"].phase, "stopped");
  assert.equal((await h.send({ type: "ADSKIP_RESOLVE", source: "input", url: st })).state.phase, "resolved");
});
test("results older than one hour lose their destination and source URL", async () => {
  const h = harness({ session: { input: { phase: "resolved", sourceUrl: st, url: destination, updatedAt: Date.now() - 3600001 } } });
  const reply = await h.send({ type: "ADSKIP_GET", source: "input" });
  assert.equal(reply.state.phase, "idle"); assert.equal(reply.state.url, undefined); assert.equal(h.session.input.sourceUrl, undefined);
});
test("Stop during a fresh DOM read cannot later submit the page API", async () => {
  let release;
  const h = harness({ hints: () => new Promise((resolve) => { release = resolve; }) });
  const pending = h.send({ type: "ADSKIP_RESOLVE", tabId: 1 });
  await until(() => release);
  assert.equal((await h.send({ type: "ADSKIP_STOP", tabId: 1 })).state.phase, "stopped");
  release({ pageUrl: input, hints: { initialCandidate: st } });
  await pending;
  assert.equal(h.session["tab:1"].phase, "stopped"); assert.equal(h.requests.length, 0);
});
test("changing the tab during a request discards its late result and auto-open", async () => {
  let release;
  const h = harness({ local: { autoOpen: true }, fetch: (url) => new Promise((resolve) => { release = () => resolve(response(st)); }) });
  const pending = h.send({ type: "ADSKIP_RESOLVE", hints: {} }, h.content());
  await until(() => release);
  h.tabs.get(1).url = "https://example.org/";
  h.chrome.tabs.onUpdated.emit(1, { url: "https://example.org/" });
  release(); await pending; await tick();
  assert.equal(h.navigated.length, 0); assert.equal(h.session["tab:1"].phase, "idle");
});
test("an old input reply cannot overwrite a newer pasted result", async () => {
  let release;
  const h = harness({ fetch: () => new Promise((resolve) => { release = () => resolve(response(st)); }) });
  const old = h.send({ type: "ADSKIP_RESOLVE", source: "input", url: input });
  await until(() => release);
  const fresh = "https://gofile.io/d/new-fixture";
  await h.send({ type: "ADSKIP_RESOLVE", source: "input", url: fresh });
  release(); await old;
  assert.equal(h.session.input.url, fresh); assert.equal(h.session.input.phase, "resolved");
});
test("continue reads new page data and avoids reusing old CSRF/request data", async () => {
  const h = harness({ fetch: (url) => response(url, "Verify on page", 403), hints: () => ({ pageUrl: input, hints: { initialCandidate: st } }) });
  await h.send({ type: "ADSKIP_RESOLVE", hints: {} }, h.content());
  assert.equal(h.session["tab:1"].code, "NEEDS_VERIFICATION");
  const reply = await h.send({ type: "ADSKIP_CONTINUE", tabId: 1 });
  assert.equal(reply.state.url, destination); assert.equal(h.requests.length, 1);
});
test("pasted manual flow continues only from the tab explicitly opened for that result", async () => {
  const h = harness({ fetch: (url) => response(url, "Verify on page", 403), hints: (id) => ({ pageUrl: h.tabs.get(id).url, hints: { initialCandidate: st } }) });
  await h.send({ type: "ADSKIP_RESOLVE", source: "input", url: input });
  assert.ok((await h.send({ type: "ADSKIP_CONTINUE", source: "input" })).error);
  await h.send({ type: "ADSKIP_OPEN", source: "input" });
  assert.equal(h.opened[0].url, input);
  const reply = await h.send({ type: "ADSKIP_CONTINUE", source: "input" });
  assert.equal(reply.state.url, destination); assert.equal(reply.state.sourceUrl, input);
  assert.equal(h.requests.length, 1);
});
test("stale DOM hints from another URL cannot replace the requested destination", async () => {
  const h = harness({ fetch: () => response(st), hints: () => ({ pageUrl: "https://1shortlink.com/ll/other", hints: { initialCandidate: "https://gofile.io/d/wrong" } }) });
  const reply = await h.send({ type: "ADSKIP_RESOLVE", tabId: 1 });
  assert.equal(reply.state.url, destination); assert.equal(h.requests.length, 1);
});
test("a message from a document that already navigated away does not start requests", async () => {
  const h = harness(); const sender = h.content(); h.tabs.get(1).url = "https://1shortlink.com/ll/new";
  await h.send({ type: "ADSKIP_RESOLVE", hints: { initialCandidate: st } }, sender);
  assert.equal(h.requests.length, 0); assert.equal(h.session["tab:1"], undefined);
});
