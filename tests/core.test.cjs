"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/core.js");
const target = "https://vexfile.com/download/example";
const st = (value) => "https://ez4short.com/st?api=publisher-placeholder&url=" + value;

test("observed /st raw tail preserves nested query, plus and signature bytes", () => {
  const signed = target + "?sig=a%2Fb%2Bc%3D&name=report+2026&url=keep-this&part=2#section";
  assert.equal(Core.ez4Destination(st(signed)), signed);
});
test("encoded and double encoded targets decode the envelope only", () => {
  const signed = target + "?token=a%2Fb%2Bc%3D&name=hello+world";
  assert.equal(Core.ez4Destination(st(encodeURIComponent(signed))), signed);
  assert.equal(Core.ez4Destination(st(encodeURIComponent(encodeURIComponent(signed)))), signed);
});
test("encoded outer value can precede another outer parameter", () => {
  assert.equal(Core.ez4Destination(st(encodeURIComponent(target)) + "&extra=1"), target);
});
test("missing URL, empty URL and corrupt encoding are distinguished", () => {
  assert.equal(Core.ez4Destination("https://ez4short.com/st?api=placeholder"), null);
  assert.throws(() => Core.ez4Destination(st("")), { code: "EMPTY_TARGET" });
  assert.throws(() => Core.ez4Destination(st("%zz")), { code: "BAD_ENCODING" });
});
test("unsupported schemes and embedded credentials never become hyperlinks", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,hello", "http://vexfile.com/x", "https://user:pass@vexfile.com/x"]) {
    assert.throws(() => Core.urlOf(value));
    assert.throws(() => Core.ez4Destination(st(encodeURIComponent(value))));
  }
});
test("host classification respects label boundaries", () => {
  assert.equal(Core.isFileHost("https://vexfile.com.evil.example/x"), false);
  assert.equal(Core.serviceOf("https://ez4short.com.evil.example/st"), "unknown");
  assert.equal(Core.serviceOf("https://sub.vexfile.com/x"), "destination");
  assert.equal(Core.serviceOf("https://disk.yandex.ru/d/example"), "destination");
});
test("1short init parses current literal call without executing page code", () => {
  const html = '<script>getLink("/get-link-download", "cipher+/=", "encrypted_link", "fresh-token");</script>';
  assert.deepEqual(Core.oneShortInit(html, "https://1shortlink.com/link-encrypted/test"), {
    endpoint: "https://1shortlink.com/get-link-download", fields: { url: "cipher+/=", type: "encrypted_link", _token: "fresh-token" }
  });
});
test("a page cannot turn the resolver into an arbitrary POST proxy", () => {
  const html = '<script>getLink("https://other.example/receive", "data", "encrypted_link", "token");</script>';
  assert.throws(() => Core.oneShortInit(html, "https://1shortlink.com/link-encrypted/test"), { code: "ENDPOINT_CHANGED" });
  assert.equal(Core.canRequest("https://1shortlink.com/account/delete", "POST"), false);
  assert.equal(Core.canRequest("https://1shortlink.com:444/get-link-download", "POST"), false);
});
test("DOM data-href entities preserve a complete destination URL", () => {
  assert.equal(Core.buttonCandidate('<button id="redirect-link" data-href="https://ez4short.com/st?api=x&amp;url=' + target + '"></button>', "https://1shortlink.com/ll/test"), st(target).replace("publisher-placeholder", "x"));
});
test("trace redacts ciphertext and publisher query values", () => {
  assert.equal(Core.describeUrl("https://1shortlink.com/link-encrypted/private-cipher"), "1shortlink.com/link-encrypted/…");
  assert.equal(Core.describeUrl(st(target)), "ez4short.com/st");
});
