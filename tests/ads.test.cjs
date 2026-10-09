"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Ads = require("../src/ads.js");
const Settings = require("../src/ad-settings.js");
function harness(preferences) {
  let stored = preferences; let enabled = Ads.services.map(({ id }) => id); const updates = [];
  const failures = { native: false, storage: false, rollback: false };
  const storage = { async get() { return { adFilters: structuredClone(stored) }; }, async set(value) { if (failures.storage) throw new Error("Storage failure"); stored = structuredClone(value.adFilters); } };
  const dnr = { async updateEnabledRulesets(update) { if (failures.native || (failures.rollback && update.enableRulesetIds.length === 3)) throw new Error("Native failure"); updates.push(update); enabled = update.enableRulesetIds.slice(); } };
  return { manager: Settings.create(storage, dnr), failures, updates, stored: () => stored, enabled: () => enabled, reset() { enabled = Ads.services.map(({ id }) => id); } };
}
test("rules are service scoped and leave verification, first-party and destination domains outside the list", () => {
  for (const service of Ads.services) {
    const [rule] = Ads.rules(service);
    assert.deepEqual(rule.condition.initiatorDomains, service.hosts);
    assert.equal(rule.action.type, "block"); assert.ok(!rule.condition.resourceTypes.includes("main_frame"));
    for (const value of ["https://challenges.cloudflare.com/turnstile/", "https://www.google.com/recaptcha/", "https://" + service.hosts[0] + "/js/ads.js", "https://gofile.io/d/fixture", "https://not-doubleclick.net.example/ads"]) assert.equal(Ads.isAdUrl(value, service.id), false);
    assert.equal(Ads.isAdUrl("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", service.id), true);
    assert.equal(Ads.isAdUrl("//pagead2.googlesyndication.com/ad", service.id), true);
  }
});
test("missing or corrupt preferences default per service and exclude unknown properties", () => {
  assert.deepEqual(Ads.normalize({ "1short": false, ez4short: "false", arbitrary: true }), { "1short": false, ez4short: true, tech8s: true });
});
test("concurrent changes serialize without losing another service's choice", async () => {
  const h = harness();
  await Promise.all([h.manager.set("1short", false), h.manager.set("ez4short", false), h.manager.set("tech8s", false)]);
  assert.deepEqual(h.stored(), { "1short": false, ez4short: false, tech8s: false }); assert.deepEqual(h.enabled(), []);
});
test("native failure does not save a preference and the queue recovers", async () => {
  const h = harness(); h.failures.native = true;
  await assert.rejects(h.manager.set("1short", false), { code: "FILTER_APPLY_FAILED" }); assert.equal(h.stored(), undefined);
  h.failures.native = false; await h.manager.set("ez4short", false);
  assert.deepEqual(h.enabled(), ["1short", "tech8s"]);
});
test("storage failure rolls native state back, and reconciliation restores saved choices after an upgrade reset", async () => {
  const h = harness({ "1short": false, ez4short: true, tech8s: false });
  await h.manager.reconcile(); h.failures.storage = true;
  await assert.rejects(h.manager.set("1short", true), { code: "FILTER_SAVE_FAILED" }); assert.deepEqual(h.enabled(), ["ez4short"]);
  h.reset(); h.failures.storage = false; await h.manager.reconcile(); assert.deepEqual(h.enabled(), ["ez4short"]);
});
test("invalid service and non-boolean input never change native rules or storage", async () => {
  const h = harness();
  for (const args of [["all", false], ["1short", "false"]]) await assert.rejects(h.manager.set(...args), { code: "INVALID_FILTER" });
  assert.equal(h.updates.length, 0); assert.equal(h.stored(), undefined);
});

test("a failed rollback is reported explicitly and the next reconciliation repairs native state", async () => {
  const h = harness(); h.failures.storage = true; h.failures.rollback = true;
  await assert.rejects(h.manager.set("1short", false), { code: "FILTER_RESTORE_FAILED" });
  assert.equal(h.stored(), undefined); assert.deepEqual(h.enabled(), ["ez4short", "tech8s"]);
  h.failures.rollback = false; await h.manager.reconcile(); assert.deepEqual(h.enabled(), ["1short", "ez4short", "tech8s"]);
});
