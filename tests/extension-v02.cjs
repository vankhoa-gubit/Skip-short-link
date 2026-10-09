"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { playwright, browserOptions } = require("./helpers.cjs");
const { fixtureServer } = require("./https-fixture.cjs");
const root = path.resolve(__dirname, "..");
const input = "https://1shortlink.com/link-encrypted/fixture";
const manualUrl = "https://1shortlink.com/link-encrypted/manual";
const delayedUrl = "https://1shortlink.com/link-encrypted/delayed";
const target = "https://vexfile.com/download/fixture?sig=a%2Fb%2Bc%3D&name=report+2026&part=2";
const fragmentTarget = target + "#section";
const next = "https://1shortlink.com/redirect-link?link=fixture";
const st = "https://ez4short.com/st?api=fixture&url=" + target;
const manualHtml = '<!doctype html><html lang="vi"><body><h1>Fixture: hoàn tất xác minh</h1><button id="verify">Hoàn tất thao tác</button><script>document.getElementById("verify").addEventListener("click",()=>{const button=document.createElement("button");button.id="redirect-link";button.setAttribute("data-href",' + JSON.stringify(st) + ');document.body.append(button);});</script></body></html>';
async function visit(page, url) { try { await page.goto(url, { waitUntil: "commit", timeout: 15000 }); } catch (error) { if (!/ERR_ABORTED/.test(error.message)) throw error; } }
async function status(page, text) { await page.locator("#status").getByText(text, { exact: true }).waitFor({ timeout: 15000 }); }

(async () => {
  fs.mkdirSync(path.join(root, "work/qa"), { recursive: true });
  const profile = fs.mkdtempSync(path.join(root, "work/extension-v02-profile-"));
  const extension = path.join(root, "extension");
  const requests = []; let releaseDelayed; let sawDelayed;
  const delayedSeen = new Promise((resolve) => { sawDelayed = resolve; });
  const fixture = await fixtureServer(async (req, response, url) => {
    requests.push({ path: url.pathname, method: req.method });
    const headers = { "content-type": "text/html;charset=utf-8", "access-control-allow-origin": "*" };
    const reply = (status, body, extra = {}) => { response.writeHead(status, { ...headers, ...extra }); response.end(body); };
    if (url.pathname === "/link-encrypted/delayed") {
      sawDelayed(); await new Promise((resolve) => { releaseDelayed = resolve; });
      return reply(302, "", { location: st });
    }
    if (url.pathname === "/link-encrypted/expired") return reply(410, "Expired");
    if (url.pathname === "/link-encrypted/manual") return reply(200, manualHtml);
    if (url.pathname === "/link-encrypted/fixture") return reply(200, '<!doctype html><html><body><button id="redirect-link" data-href="' + next.replace(/&/g, "&amp;") + '">Continue</button></body></html>');
    if (url.pathname === "/redirect-link") return reply(302, "", { location: st });
    return reply(200, "<!doctype html><html><body><h1>Fixture page</h1></body></html>");
  });
  const context = await playwright().chromium.launchPersistentContext(profile, {
    headless: true, channel: "chromium", ...browserOptions(), viewport: { width: 1440, height: 900 },
    args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension, ...fixture.browserArgs]
  });
  const checks = []; const errors = [];
  let worker; let popup;
  const report = { checkedAt: new Date().toISOString(), mode: "Unpacked MV3 extension in isolated Chromium; local HTTPS fixtures with browser-only host mapping and a test certificate, real chrome APIs", checks, errors, outcome: "FAIL" };
  try {
    worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const extensionId = worker.url().split("/")[2];
    const unrelated = await context.newPage(); await visit(unrelated, "https://example.org/");
    async function openPopup(activePage = unrelated) {
      const id = await worker.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({});
        return tabs.find((tab) => tab.url === url)?.id ?? tabs.find((tab) => tab.active)?.id;
      }, activePage.url());
      assert.ok(Number.isInteger(id));
      await worker.evaluate((tabId) => chrome.tabs.update(tabId, { active: true }), id);
      const created = context.waitForEvent("page");
      await worker.evaluate((url) => chrome.tabs.create({ url, active: false }), "chrome-extension://" + extensionId + "/popup.html");
      const page = await created;
      page.on("pageerror", (error) => errors.push(error.message));
      await page.waitForFunction(() => { const status = document.getElementById("status"); return status && status.textContent !== "Đang đọc trạng thái…"; });
      await page.setViewportSize({ width: 360, height: 600 });
      return page;
    }
    async function paste(url) {
      await popup.locator("#link-input").fill(url);
      await popup.locator("#link-input").press("Enter");
    }
    popup = await openPopup();
    await paste(st + "#section"); await status(popup, "Đã tìm được trang đích");
    assert.equal(await popup.locator("#destination").getAttribute("href"), fragmentTarget);
    assert.equal(unrelated.url(), "https://example.org/");
    assert.equal(await popup.locator("#source-label").innerText(), "Kết quả link đã dán");
    checks.push("Paste /st from an unrelated tab: exact signed URL and fragment, no tab navigation");
    await popup.screenshot({ path: path.join(root, "work/qa/popup-v02-resolved.png"), fullPage: true });

    for (const url of ["javascript:alert(1)", "https://1shortlink.com.evil.example/ll/x", "https://user:pass@1shortlink.com/ll/x", ""]) {
      await paste(url); await popup.locator("#input-error").waitFor({ state: "visible" });
      assert.equal(await popup.locator("#link-input").getAttribute("aria-invalid"), "true");
      assert.equal(await popup.locator("#destination").getAttribute("href"), fragmentTarget);
    }
    checks.push("Invalid pasted input: inline accessible error, prior result preserved");
    await popup.screenshot({ path: path.join(root, "work/qa/popup-v02-invalid.png"), fullPage: true });

    await paste(input); await status(popup, "Đã tìm được trang đích");
    assert.equal(await popup.locator("#destination").getAttribute("href"), target);
    checks.push("Pasted 1short: fetch → existing page candidate → redirect → destination");
    await popup.close(); popup = await openPopup();
    await status(popup, "Đã tìm được trang đích");
    assert.equal(await popup.locator("#link-input").inputValue(), input);
    checks.push("Close/reopen popup restores pasted input and result");

    await paste(delayedUrl); await delayedSeen;
    await popup.close(); releaseDelayed(); popup = await openPopup();
    await status(popup, "Đã tìm được trang đích");
    assert.equal(await popup.locator("#destination").getAttribute("href"), target);
    checks.push("Closing a popup during a pending request does not cancel its detached input job");

    await paste("https://1shortlink.com/link-encrypted/expired");
    await status(popup, "Chưa lấy được link");
    assert.match(await popup.locator("#message").innerText(), /hết hạn/);
    assert.equal(await popup.locator("#continue").isVisible(), false);
    assert.equal(await popup.locator("#retry").isVisible(), true);
    checks.push("Expired link displays a specific error and retry, without manual continuation");

    await paste(manualUrl); await status(popup, "Cần thao tác trên trang");
    assert.equal(await popup.locator("#continue").isVisible(), true);
    await popup.screenshot({ path: path.join(root, "work/qa/popup-v02-manual.png"), fullPage: true });
    const opened = context.waitForEvent("page"); await popup.locator("#open").click();
    const manual = await opened;
    try { await manual.locator("#verify").waitFor({ timeout: 10000 }); }
    catch (error) { console.error("Manual tab", manual.url(), (await manual.locator("body").innerText()).slice(0,1200)); console.error("Input state", await worker.evaluate(() => chrome.storage.session.get("input"))); throw error; }
    await manual.getByRole("button", { name: "Hoàn tất thao tác", exact: true }).click();
    await popup.locator("#continue").click(); await status(popup, "Đã tìm được trang đích");
    assert.equal(await popup.locator("#destination").getAttribute("href"), target);
    checks.push("Pasted manual flow: explicitly opened tab → user action → fresh DOM → resolved input result");

    const tabManual = await context.newPage(); await visit(tabManual, manualUrl + "?tab=1");
    await tabManual.locator("#adskip-widget").getByText("Cần thao tác trên trang", { exact: true }).waitFor();
    const resume = tabManual.locator("#adskip-widget").getByRole("button", { name: "Tiếp tục kiểm tra", exact: true });
    await tabManual.screenshot({ path: path.join(root, "work/qa/widget-v02-manual.png") });
    await tabManual.getByRole("button", { name: "Hoàn tất thao tác", exact: true }).click();
    await resume.click();
    await tabManual.locator("#adskip-widget").getByText("Đã tìm được trang đích", { exact: true }).waitFor();
    assert.equal(await tabManual.locator("#adskip-widget .destination").getAttribute("href"), target);
    checks.push("Widget manual continuation resolves the newly available DOM candidate");

    await popup.close(); popup = await openPopup(tabManual);
    await popup.locator("#resolve").click(); await status(popup, "Đã tìm được trang đích");
    assert.equal(await popup.locator("#source-label").innerText(), "Kết quả tab đang mở");
    assert.equal(await popup.locator("#destination").getAttribute("href"), target);
    checks.push("Switching from pasted result to active-tab analysis uses that tab's fresh DOM");
    await popup.setViewportSize({ width: 320, height: 600 });
    assert.ok(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await popup.locator("#link-input").focus();
    assert.equal(await popup.locator("#link-input").evaluate((node) => node === document.activeElement), true);
    await popup.screenshot({ path: path.join(root, "work/qa/popup-v02-320.png"), fullPage: true });
    checks.push("Popup layout fits 320px and exposes keyboard focus");
    assert.deepEqual(errors, []);
    report.browser = context.browser()?.version(); report.outcome = "PASS";
  } finally {
    fs.writeFileSync(path.join(root, "work/extension-v02-result.json"), JSON.stringify(report, null, 2));
    await context.close();
    await fixture.close();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
