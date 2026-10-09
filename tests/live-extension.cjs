"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const Core = require("../src/core.js");
const { playwright, browserOptions } = require("./helpers.cjs");
const root = path.resolve(__dirname, "..");

(async () => {
  const input = process.argv[2] || process.env.ADSKIP_LIVE_URL;
  if (!input) throw new Error("Supply ADSKIP_LIVE_URL or one URL argument. This test uses the live site.");
  const start = Core.urlOf(input).href;
  fs.mkdirSync(path.join(root, "work/qa"), { recursive: true });
  const profile = fs.mkdtempSync(path.join(root, "work/live-extension-profile-"));
  const extension = path.join(root, "extension");
  const context = await playwright().chromium.launchPersistentContext(profile, {
    headless: true, channel: "chromium", ...browserOptions(), viewport: { width: 1440, height: 900 },
    args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension]
  });
  const exchanges = []; const checks = []; let blockedRequests = 0; let pageErrors = 0; let result; let inputResult; let failure; let browser;
  try {
    // Real responses on supported services; third-party ads and media are blocked.
    // No file host is requested and the default auto-open preference stays off.
    await context.route("**/*", async (route) => {
      const request = route.request(); const url = new URL(request.url());
      if (url.protocol !== "https:") return route.continue();
      if (!Core.SERVICE_HOSTS.has(url.hostname) || ["image", "media", "font"].includes(request.resourceType())) {
        blockedRequests++; return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    context.on("response", (response) => {
      const request = response.request();
      if (request.resourceType() === "document" || request.method() === "POST") {
        exchanges.push({ method: request.method(), request: Core.describeUrl(response.url()), status: response.status() });
      }
    });
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    const page = await context.newPage();
    page.on("pageerror", () => { pageErrors++; });
    try { await page.goto(start, { waitUntil: "commit", timeout: 20000 }); }
    catch (error) { if (!/ERR_ABORTED/.test(error.message)) throw error; }
    const panel = page.locator("#adskip-widget");
    await panel.locator(".destination").waitFor({ state: "visible", timeout: 45000 });
    const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id, page.url());
    assert.ok(Number.isInteger(tabId));
    result = await worker.evaluate(async (id) => (await chrome.storage.session.get("tab:" + id))["tab:" + id], tabId);
    assert.equal(result.phase, "resolved");
    assert.ok(Core.isFileHost(result.url));
    assert.equal(await panel.locator(".destination").getAttribute("href"), result.url);
    assert.ok(Core.SERVICE_HOSTS.has(new URL(page.url()).hostname), "Must not auto-open or download the resource");
    await panel.locator("summary").click();
    await page.screenshot({ path: path.join(root, "work/qa/live-extension.png") });
    checks.push("Supplied live URL navigates through supported services and resolves a file-host address without auto-opening it");
    const unrelated = await context.newPage(); await unrelated.goto("about:blank#input-check"); await unrelated.bringToFront();
    const unrelatedId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id);
    assert.ok(Number.isInteger(unrelatedId));
    await worker.evaluate((id) => chrome.tabs.update(id, { active: true }), unrelatedId);
    const created = context.waitForEvent("page");
    await worker.evaluate((url) => chrome.tabs.create({ url, active: false }), "chrome-extension://" + worker.url().split("/")[2] + "/popup.html");
    const popup = await created;
    popup.on("pageerror", () => { pageErrors++; });
    await popup.waitForFunction(() => document.getElementById("status")?.textContent !== "Đang đọc trạng thái…");
    await popup.locator("#link-input").fill(start); await popup.locator("#link-input").press("Enter");
    await popup.locator("#status").getByText("Đã tìm được trang đích", { exact: true }).waitFor({ timeout: 30000 });
    inputResult = await worker.evaluate(async () => (await chrome.storage.session.get("input")).input);
    assert.equal(inputResult.phase, "resolved"); assert.equal(inputResult.url, result.url);
    assert.equal(await popup.locator("#destination").getAttribute("href"), result.url);
    assert.equal(unrelated.url(), "about:blank#input-check");
    checks.push("Pasting the supplied URL in the actual popup produces the same destination and preserves the unrelated tab");
    assert.equal(pageErrors, 0);
    browser = context.browser().version();
  } catch (error) {
    // Keep token-bearing URLs out of logs even on browser/navigation failures.
    failure = error.name === "TimeoutError" ? "Timed out while waiting for a resolved destination" : "Live extension assertion or navigation failed";
    console.error(failure);
    process.exitCode = 1;
  } finally { await context.close(); }
  const report = {
    checkedAt: new Date().toISOString(),
    scope: "Unpacked MV3 extension, isolated Chromium profile, real supported-service responses; third-party ads/media blocked; no file download; auto-open off.",
    outcome: failure ? "FAIL" : "PASS", browser, checks,
    result: result ? { ...result, sourceUrl: result.sourceUrl ? Core.describeUrl(result.sourceUrl) : undefined } : null,
    inputResult: inputResult ? { ...inputResult, sourceUrl: inputResult.sourceUrl ? Core.describeUrl(inputResult.sourceUrl) : undefined } : null,
    exchanges, blockedRequests, pageErrors, failure
  };
  fs.writeFileSync(path.join(root, "work/live-extension-result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error.name + ": live extension setup failed"); process.exitCode = 1; });
