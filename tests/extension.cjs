"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { playwright, browserOptions } = require("./helpers.cjs");
const root = path.resolve(__dirname, "..");
const input = "https://1shortlink.com/link-encrypted/fixture";
const next = "https://1shortlink.com/redirect-link?link=fixture";
const target = "https://vexfile.com/download/fixture?signature=a%2Fb%2Bc%3D&part=2";
const st = "https://ez4short.com/st?api=publisher-placeholder&url=" + target;
const oneHtml = '<!doctype html><html><head><title>1short fixture</title></head><body><h1>Confirm continue</h1><button id="redirect-link">Continue</button><script>getLink("/get-link-download", "fixture", "encrypted_link", "fixture-csrf")</script></body></html>';

async function visit(page, url) { try { await page.goto(url, { waitUntil: "commit", timeout: 15000 }); } catch (error) { if (!/ERR_ABORTED/.test(error.message)) throw error; } }
async function panelState(page, title) {
  try { await page.locator("#adskip-widget").getByText(title, { exact: true }).waitFor({ timeout: 22000 }); }
  catch (error) { console.error("Panel:", await page.locator("#adskip-widget").innerText().catch(() => "absent")); throw error; }
}

(async () => {
  fs.mkdirSync(path.join(root, "work/qa"), { recursive: true });
  const profile = fs.mkdtempSync(path.join(root, "work/extension-profile-"));
  const extension = path.join(root, "extension");
  const context = await playwright().chromium.launchPersistentContext(profile, {
    headless: true, channel: "chromium", ...browserOptions(), viewport: { width: 1440, height: 900 },
    args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension]
  });
  const checks = []; const errors = []; let apiCalls = 0;
  try {
    await context.route("**/*", async (route) => {
      const request = route.request(); const url = new URL(request.url());
      if (url.protocol !== "https:") return route.continue();
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "content-type": "text/html;charset=utf-8" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers, body: "" });
      if (url.hostname === "1shortlink.com" && url.pathname === "/get-link-download") {
        apiCalls++;
        assert.equal(new URLSearchParams(request.postData()).get("_token"), "fixture-csrf");
        return route.fulfill({ status: 200, headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ status: "success", redirect_url: next }) });
      }
      if (url.hostname === "1shortlink.com" && url.pathname === "/redirect-link") return route.fulfill({ status: 302, headers: { ...headers, location: st }, body: "" });
      return route.fulfill({ status: 200, headers, body: url.hostname === "1shortlink.com" ? oneHtml : "<!doctype html><html><body><h1>Fixture page</h1></body></html>" });
    });
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    const extensionId = worker.url().split("/")[2];
    const page = await context.newPage();
    page.on("pageerror", (error) => { if (!/getLink is not defined/.test(error.message)) errors.push(error.message); });
    await visit(page, input);
    await panelState(page, "Đã tìm được trang đích");
    assert.equal(await page.locator("#adskip-widget .destination").getAttribute("href"), target);
    assert.equal(apiCalls, 1);
    checks.push("Unpacked MV3 extension: content script → service worker fetch → HTTP redirect → full signed URL (fixture network)");
    const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url).id, input);
    const initial = await worker.evaluate(async (id) => (await chrome.storage.session.get("tab:" + id))["tab:" + id], tabId);
    assert.equal(initial.phase, "resolved"); assert.equal(initial.url, target);
    await page.screenshot({ path: path.join(root, "work/qa/extension-desktop.png") });
    const article = await context.newPage(); await visit(article, "https://tech8s.net/article/");
    await panelState(article, "Cần thao tác trên trang");
    const firstAfterSecond = await worker.evaluate(async (id) => (await chrome.storage.session.get("tab:" + id))["tab:" + id], tabId);
    assert.equal(firstAfterSecond.phase, "resolved");
    checks.push("Per-tab state: Tech8s manual state does not replace the resolved 1short tab");
    const ez = await context.newPage(); await visit(ez, st); await panelState(ez, "Đã tìm được trang đích");
    assert.equal(await ez.locator("#adskip-widget .destination").getAttribute("href"), target);
    checks.push("document-start/webNavigation captures the /st destination");
    await worker.evaluate(async (id) => chrome.tabs.update(id, { active: true }), tabId);
    const popupPromise = context.waitForEvent("page");
    await worker.evaluate(async (url) => chrome.tabs.create({ url, active: false }), "chrome-extension://" + extensionId + "/popup.html");
    const popup = await popupPromise;
    try { await popup.getByText("Đã tìm được trang đích", { exact: true }).waitFor({ timeout: 10000 }); }
    catch (error) {
      console.error("Popup:", await popup.locator("body").innerText());
      console.error("Tabs:", await worker.evaluate(async () => (await chrome.tabs.query({})).map((tab) => ({ id: tab.id, active: tab.active, url: tab.url }))));
      throw error;
    }
    assert.equal(await popup.locator("#destination").getAttribute("href"), target);
    await popup.setViewportSize({ width: 360, height: 650 });
    await popup.locator("summary").click();
    await popup.screenshot({ path: path.join(root, "work/qa/extension-popup.png"), fullPage: true });
    checks.push("Real extension popup reads the active tab state and renders the trace");
    await page.locator("#adskip-widget").getByRole("button", { name: "Tìm lại", exact: true }).click();
    await page.locator("#adskip-widget").getByRole("button", { name: "Dừng", exact: true }).click();
    await panelState(page, "Đã dừng");
    const stopped = await worker.evaluate(async (id) => (await chrome.storage.session.get("tab:" + id))["tab:" + id], tabId);
    assert.equal(stopped.phase, "stopped");
    checks.push("Stop aborts the pending page-hint wait and records a stopped state");
    await page.locator("#adskip-widget").getByRole("button", { name: "Tìm lại", exact: true }).click();
    await panelState(page, "Đã tìm được trang đích");
    checks.push("Retry resumes after Stop");
    await page.locator("#adskip-widget").getByRole("checkbox", { name: "Mở trang đích khi tìm được" }).check();
    await page.waitForURL(target, { waitUntil: "commit", timeout: 10000 });
    const preference = await worker.evaluate(() => chrome.storage.local.get("autoOpen"));
    assert.equal(preference.autoOpen, true);
    checks.push("Explicit auto-open preference navigates only to a recognized file host");
    assert.deepEqual(errors, []);
    const report = { checkedAt: new Date().toISOString(), mode: "Unpacked MV3 extension in isolated Chromium profile; fixture network, real chrome.* APIs", browser: context.browser()?.version(), checks, errors };
    fs.writeFileSync(path.join(root, "work/extension-result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await context.close(); }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
