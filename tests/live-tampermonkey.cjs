"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const Core = require("../src/core.js");
const { playwright, browserOptions } = require("./helpers.cjs");
const root = path.resolve(__dirname, "..");

(async () => {
  const input = process.argv[2] || process.env.ADSKIP_LIVE_URL;
  if (!input) throw new Error("Supply ADSKIP_LIVE_URL or one URL argument.");
  const start = Core.urlOf(input).href;
  const manager = path.resolve(process.env.ADSKIP_TAMPERMONKEY_PATH || path.join(root, "work/tampermonkey"));
  const manifest = JSON.parse(fs.readFileSync(path.join(manager, "manifest.json"), "utf8"));
  const bundle = fs.readFileSync(path.join(root, "dist/adskip.user.js"), "utf8");
  fs.mkdirSync(path.join(root, "work/qa"), { recursive: true });
  // Install in a new profile for this run. An unpacked manager can reject a copied/restarted profile's script origin.
  const profile = fs.mkdtempSync(path.join(root, "work/tampermonkey-live-profile-"));
  const context = await playwright().chromium.launchPersistentContext(profile, {
    headless: true, channel: "chromium", ...browserOptions(), viewport: { width: 1440, height: 900 }, acceptDownloads: false,
    args: ["--disable-extensions-except=" + manager, "--load-extension=" + manager]
  });
  const exchanges = []; const checks = []; let blockedRequests = 0; let pageErrors = 0; let failure; let destination; let stage = "manager installation";
  const report = { checkedAt: new Date().toISOString(), scope: "Official Tampermonkey and bundle installed through editor in a fresh isolated Chromium profile for this live run; real GM APIs and supported-service responses; third-party ads/media blocked; auto-open off; downloads disabled", outcome: "FAIL", input: Core.describeUrl(start), managerVersion: manifest.version, checks, exchanges };
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const options = await context.newPage();
    await options.goto("chrome://extensions/"); await options.locator("#devMode").waitFor();
    if (!await options.locator("#devMode").evaluate((node) => node.checked)) await options.locator("#devMode").click();
    await options.goto("chrome://extensions/?id=" + worker.url().split("/")[2]);
    const allow = options.locator("#allow-user-scripts cr-toggle"); await allow.waitFor();
    if (!await allow.evaluate((node) => node.checked)) await allow.click();
    await options.goto("chrome-extension://" + worker.url().split("/")[2] + "/options.html");
    await options.getByText("Installed Userscripts", { exact: true }).click();
    await options.getByTitle("Create a new script...", { exact: true }).click();
    await options.locator(".CodeMirror").click(); await options.keyboard.press("Control+A");
    await options.keyboard.insertText(bundle); await options.keyboard.press("Control+S");
    await options.getByText("AdSkip: 1short & EZ4Short", { exact: true }).first().waitFor();
    checks.push("Bundle installed through the real Tampermonkey editor and native userscript permission in a fresh profile");

    // No hostname mapping or certificate override. Only the QA harness blocks third-party resources.
    await context.route("**/*", (route) => {
      const request = route.request(); const url = new URL(request.url());
      if (url.protocol === "https:" && (!Core.SERVICE_HOSTS.has(url.hostname) || ["image", "media", "font"].includes(request.resourceType()))) {
        blockedRequests++; return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    context.on("response", (response) => {
      const request = response.request();
      if (request.resourceType() === "document" || request.method() === "POST") exchanges.push({ method: request.method(), request: Core.describeUrl(response.url()), status: response.status() });
    });
    stage = "live navigation";
    const page = await context.newPage(); page.on("pageerror", () => { pageErrors++; });
    try { await page.goto(start, { waitUntil: "commit", timeout: 20000 }); }
    catch (error) { if (!/ERR_ABORTED/.test(error.message)) throw error; }
    stage = "destination resolution";
    const panel = page.locator("#adskip-widget");
    await panel.getByText("Đã tìm được trang đích", { exact: true }).waitFor({ timeout: 45000 });
    destination = await panel.locator(".destination").getAttribute("href");
    assert.ok(Core.isFileHost(destination));
    assert.ok(Core.SERVICE_HOSTS.has(new URL(page.url()).hostname));
    const localDestination = Core.oneShortDestination(start);
    if (localDestination) assert.equal(destination, localDestination);
    assert.equal(pageErrors, 0);
    await panel.locator("summary").click();
    await page.screenshot({ path: path.join(root, "work/qa/live-tampermonkey.png") });
    checks.push("Installed userscript resolves the supplied URL on the actual shortener page using real GM APIs");
    checks.push("Destination matches the original full-pages URL; no automatic navigation or page error");
    report.browser = context.browser().version(); report.outcome = "PASS";
  } catch (error) {
    failure = (error.name === "TimeoutError" ? "Timed out during " : "Failed during ") + stage;
    process.exitCode = 1;
  } finally {
    Object.assign(report, { destination, blockedRequests, pageErrors, failure });
    fs.writeFileSync(path.join(root, "work/live-tampermonkey-result.json"), JSON.stringify(report, null, 2));
    await context.close();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error.name + ": live Tampermonkey setup failed"); process.exitCode = 1; });
