"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { playwright, browserOptions } = require("./helpers.cjs");
const root = path.resolve(__dirname, "..");
(async () => {
  const extension = path.join(root, "extension");
  const context = await playwright().chromium.launchPersistentContext(fs.mkdtempSync(path.join(root, "work/worker-profile-")), {
    headless: true, channel: "chromium", ...browserOptions(), args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension, "--host-resolver-rules=MAP * ~NOTFOUND"]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const workerUrl = worker.url(); const id = workerUrl.split("/")[2];
    const target = "https://gofile.io/d/lifecycle-fixture";
    const input = "https://ez4short.com/st?api=fixture&url=" + target;
    await worker.evaluate(async (sourceUrl) => {
      globalThis.__qaBeforeRestart = true;
      await chrome.storage.session.set({ popupSource: "input", input: { phase: "resolving", sourceUrl, steps: [], updatedAt: Date.now() } });
    }, input);
    const cdp = await context.browser().newBrowserCDPSession();
    const { targetInfos } = await cdp.send("Target.getTargets");
    const workerTarget = targetInfos.find((target) => target.type === "service_worker" && target.url === workerUrl);
    assert.ok(workerTarget);
    const stopped = await cdp.send("Target.closeTarget", { targetId: workerTarget.targetId });
    assert.equal(stopped.success, true);
    const popup = await context.newPage(); await popup.goto("chrome-extension://" + id + "/popup.html");
    await popup.locator("#status").getByText("Đã dừng", { exact: true }).waitFor({ timeout: 15000 });
    assert.match(await popup.locator("#message").innerText(), /bị ngắt/);
    assert.equal(await worker.evaluate(() => globalThis.__qaBeforeRestart), undefined);
    const interrupted = await worker.evaluate(() => chrome.storage.session.get("input"));
    assert.equal(interrupted.input.code, "SESSION_INTERRUPTED");
    assert.equal(interrupted.input.phase, "stopped");
    await popup.locator("#retry").click();
    await popup.locator("#status").getByText("Đã tìm được trang đích", { exact: true }).waitFor();
    assert.equal(await popup.locator("#destination").getAttribute("href"), target);
    const report = { checkedAt: new Date().toISOString(), outcome: "PASS", browser: context.browser().version(), scope: "Real MV3 worker terminated through CDP; storage.session seeded with an interrupted job; restarted worker has a fresh JS global and restores the job as stopped, then retry resolves.", checks: ["Actual worker shutdown/restart", "Interrupted state persisted immediately", "Popup retry after worker restart"] };
    fs.writeFileSync(path.join(root, "work/worker-lifecycle-result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await context.close(); }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
