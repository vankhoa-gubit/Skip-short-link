"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolve } = require("../src/resolver.js");
const input = "https://1shortlink.com/link-encrypted/fixture";
const next = "https://1shortlink.com/redirect-link?link=fixture";
const destination = "https://vexfile.com/download/fixture?signature=abc%2Bdef%3D";
const st = "https://ez4short.com/st?api=placeholder&url=" + destination;
const html = '<script>getLink("/get-link-download", "fixture-cipher", "encrypted_link", "fixture-csrf");</script>';

test("full inspected protocol resolves a destination without fetching the file", async () => {
  const calls = [];
  const request = async (url, config) => {
    calls.push([url, config.method || "GET"]);
    if (url === input) return { status: 200, finalUrl: input, text: html };
    if (config.method === "POST") {
      assert.equal(config.fields._token, "fixture-csrf");
      return { status: 200, finalUrl: url, text: JSON.stringify({ status: "success", redirect_url: next }) };
    }
    if (url === next) return { status: 200, finalUrl: st, text: "" };
    throw new Error("Unexpected request, including any file-host request");
  };
  const result = await resolve(input, { request });
  assert.equal(result.phase, "resolved"); assert.equal(result.url, destination);
  assert.equal(calls.length, 3);
  assert.ok(!JSON.stringify(result.steps).includes("fixture-csrf"));
  assert.ok(!JSON.stringify(result.steps).includes("placeholder"));
});
test("existing DOM candidate avoids repeating the page API call", async () => {
  let calls = 0;
  const result = await resolve(input, { initialCandidate: next, request: async (url) => { calls++; assert.equal(url, next); return { status: 200, finalUrl: st, text: "" }; } });
  assert.equal(result.phase, "resolved"); assert.equal(calls, 1);
});
test("direct /st route requires no network requests", async () => {
  const result = await resolve(st, { request() { throw new Error("No request expected"); } });
  assert.equal(result.url, destination); assert.equal(result.phase, "resolved");
});
test("a redirect cycle stops and does not retry forever", async () => {
  const result = await resolve(input, { request: async (url, config) => config.method === "POST" ? { status: 200, text: JSON.stringify({ status: "success", redirect_url: input }) } : { status: 200, text: html, finalUrl: input } });
  assert.equal(result.code, "LOOP"); assert.equal(result.phase, "manual");
});
test("hop limit bounds a changing chain", async () => {
  const result = await resolve(input, { maxHops: 2, request: async (url, config) => config.method === "POST" ? { status: 200, text: JSON.stringify({ status: "success", redirect_url: next }) } : { status: 200, text: html, finalUrl: url } });
  assert.equal(result.code, "HOP_LIMIT");
});
test("CAPTCHA or access restriction remains a manual state", async () => {
  const result = await resolve(input, { request: async () => ({ status: 403, text: "Verify you are human", finalUrl: input }) });
  assert.equal(result.code, "NEEDS_VERIFICATION"); assert.equal(result.phase, "manual");
});
test("non JSON API responses do not become guessed links", async () => {
  const result = await resolve(input, { initialHtml: html, request: async () => ({ status: 200, text: "<html>Verify access</html>" }) });
  assert.equal(result.code, "NON_JSON"); assert.equal(result.phase, "manual");
});
test("abort discards an in-flight successful reply", async () => {
  const controller = new AbortController();
  const result = await resolve(input, { signal: controller.signal, request: async () => { controller.abort(); return { status: 200, text: html, finalUrl: input }; } });
  assert.equal(result.phase, "stopped"); assert.equal(result.code, "CANCELLED");
});
test("expired aliases, unsupported EZ4 aliases and bare articles are explicit", async () => {
  const expired = await resolve(input, { request: async () => ({ status: 404, finalUrl: input, text: "" }) });
  assert.equal(expired.code, "EXPIRED_LINK");
  assert.equal((await resolve("https://ez4short.com/some-alias")).code, "EZ4_ALIAS");
  assert.equal((await resolve("https://tech8s.net/article/")).code, "ARTICLE_WITHOUT_CONTEXT");
});
test("unknown hosts stop before any request or automatic navigation", async () => {
  const result = await resolve(input, { initialCandidate: "https://unknown.example/continue", request() { throw new Error("No request allowed"); } });
  assert.equal(result.phase, "manual"); assert.equal(result.code, "UNSUPPORTED_HOST");
});
