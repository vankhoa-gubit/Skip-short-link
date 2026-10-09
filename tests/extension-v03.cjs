"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { playwright, browserOptions } = require("./helpers.cjs");
const { fixtureServer } = require("./https-fixture.cjs");
const root = path.resolve(__dirname, "..");
const target = "https://vexfile.com/download/v03-fixture?sig=a%2Fb%2Bc%3D&part=2#download";
const redirectTarget = target.split("#")[0];
const st = "https://ez4short.com/st?api=fixture&url=" + encodeURIComponent(redirectTarget);
const extraHosts = ["3nbf4.com", "pagead2.googlesyndication.com", "challenges.cloudflare.com"];
async function visit(page, url) {
  try { await page.goto(url, { waitUntil: "load", timeout: 15000 }); }
  catch (error) { if (!/ERR_ABORTED/.test(error.message)) throw error; }
}
async function panelState(page, title) { await page.locator("#adskip-widget").getByText(title, { exact: true }).waitFor({ timeout: 22000 }); }
async function nativeState(worker, expected) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const actual = await worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
    if (actual.sort().join() === expected.slice().sort().join()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.deepEqual((await worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).sort(), expected.slice().sort());
}
function resourceHtml(service, run) {
  const adHost = service === "1short" || service === "external" ? "3nbf4.com" : "pagead2.googlesyndication.com";
  const control = service === "1short" ? '<button id="redirect-link" data-href="' + target.replaceAll("&", "&amp;") + '">Get link</button>' :
    service === "ez4short" ? '<a class="get-link" href="' + target.replaceAll("&", "&amp;") + '">Get link</a>' : "";
  return '<!doctype html><html lang="vi"><head><title>AdSkip 0.3 fixture</title></head><body style="font-family:Segoe UI;padding:32px;background:#f7fafc"><h1>Kiểm tra AdSkip 0.3</h1><p>Trang HTTPS mẫu dùng để kiểm tra bộ lọc theo dịch vụ.</p>' + control +
    '<script src="/essential.js?run=' + run + '"></script><script src="https://vexfile.com/keep.js?run=' + run + '"></script>' +
    '<script src="https://' + adHost + '/act/files/tag.min.js?run=' + run + '"></script>' +
    '<iframe id="ad-frame" title="Advertisement fixture" src="https://' + adHost + '/frame?run=' + run + '"></iframe>' +
    '<iframe id="captcha-frame" title="Verification fixture" src="https://challenges.cloudflare.com/frame?run=' + run + '"></iframe>' +
    '<ins id="ad-slot" class="adsbygoogle" style="display:block;width:200px;height:40px">Advertisement slot fixture</ins></body></html>';
}
(async () => {
  const exchanges = []; const checks = []; const errors = []; const blocked = [];
  const fixture = await fixtureServer((req, res, url) => {
    exchanges.push({ host: url.hostname, path: url.pathname, run: url.searchParams.get("run"), method: req.method });
    const reply = (status, body, headers = {}) => { res.writeHead(status, { "content-type": "text/html;charset=utf-8", "access-control-allow-origin": "*", ...headers }); res.end(body); };
    if (url.pathname === "/essential.js") return reply(200, "window.__essential=true;", { "content-type": "text/javascript" });
    if (url.pathname === "/keep.js") return reply(200, "window.__fileResource=true;", { "content-type": "text/javascript" });
    if (url.pathname.endsWith("tag.min.js")) return reply(200, "window.__adScript=true;", { "content-type": "text/javascript" });
    if (url.pathname === "/frame") return reply(200, "<html><body>Resource fixture: " + url.hostname + "</body></html>");
    if (url.pathname === "/redirected-alias") return reply(302, "", { location: st });
    if (url.pathname === "/final-alias") return reply(200, '<html><body><a id="go-link" href="' + target.replaceAll("&", "&amp;") + '">Get link</a></body></html>');
    if (url.pathname === "/manual-alias") return reply(200, '<html><body><h1>Manual fixture</h1><a id="get-link" class="get-link disabled" aria-disabled="true" href="' + target.replaceAll("&", "&amp;") + '">Wait</a><button id="verify">Hoàn tất thao tác</button><script>document.getElementById("verify").onclick=()=>{const link=document.getElementById("get-link");link.classList.remove("disabled");link.removeAttribute("aria-disabled");}</script></body></html>');
    const service = url.hostname.includes("1shortlink") ? "1short" : url.hostname.includes("ez4short") ? "ez4short" : url.hostname.includes("tech8s") ? "tech8s" : "external";
    return reply(200, resourceHtml(service, url.searchParams.get("run") || "default"));
  }, extraHosts);
  const profile = fs.mkdtempSync(path.join(root, "work/extension-v03-profile-"));
  const extension = path.join(root, "extension");
  const options = { headless: true, channel: "chromium", ...browserOptions(), viewport: { width: 1440, height: 900 }, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension, ...fixture.browserArgs] };
  let context;
  const report = { checkedAt: new Date().toISOString(), mode: "Unpacked MV3 extension, actual declarativeNetRequest rules and HTTPS fixture server; no Playwright routing or network interception; browser-only host mapping and QA certificate", outcome: "FAIL", checks, errors, blocked, exchanges };
  try {
    context = await playwright().chromium.launchPersistentContext(profile, options);
    let worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const id = worker.url().split("/")[2];
    await nativeState(worker, ["1short", "ez4short", "tech8s"]);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => { const url = new URL(request.url()); blocked.push({ host: url.hostname, path: url.pathname, failure: request.failure()?.errorText }); });
    const count = (run, host) => exchanges.filter((item) => item.run === run && item.host === host).length;
    async function essentials(run) {
      await page.waitForFunction(() => window.__essential && window.__fileResource);
      await page.frameLocator("#captcha-frame").getByText("Resource fixture: challenges.cloudflare.com").waitFor();
      assert.ok(count(run, "challenges.cloudflare.com") > 0); assert.ok(count(run, "vexfile.com") > 0);
    }
    await visit(page, "https://1shortlink.com/ll/filter?run=one-on"); await panelState(page, "Đã tìm được trang đích"); await essentials("one-on");
    assert.equal(await page.locator("#adskip-widget .destination").getAttribute("href"), target);
    assert.equal(count("one-on", "3nbf4.com"), 0); assert.ok(blocked.some((item) => item.host === "3nbf4.com" && /BLOCKED_BY_CLIENT/.test(item.failure)));
    assert.equal(await page.locator("#ad-slot").isVisible(), false);
    checks.push("Native 1short rules block advertising script/frame before the server receives them; signed link, first-party script, file-host resource and verification frame still work");
    const oneToggle = page.locator("#adskip-widget").getByRole("checkbox", { name: "Chặn quảng cáo trên 1shortlink", exact: true });
    await oneToggle.uncheck(); await nativeState(worker, ["ez4short", "tech8s"]);
    assert.equal(await page.locator("#ad-slot").isVisible(), true);
    await visit(page, "https://1shortlink.com/ll/filter?run=one-off"); await panelState(page, "Đã tìm được trang đích"); await essentials("one-off");
    await page.waitForFunction(() => window.__adScript === true); assert.ok(count("one-off", "3nbf4.com") >= 2);
    assert.equal(await oneToggle.isChecked(), false);
    checks.push("Widget toggle disables native rules and restores cosmetic elements; on the next page load advertising requests reach the server");
    await worker.evaluate((tabUrl) => chrome.tabs.query({}).then((tabs) => chrome.tabs.update(tabs.find((tab) => tab.url === tabUrl).id, { active: true })), page.url());
    const created = context.waitForEvent("page");
    await worker.evaluate((url) => chrome.tabs.create({ url, active: false }), "chrome-extension://" + id + "/popup.html");
    const popup = await created; popup.on("pageerror", (error) => errors.push(error.message));
    await popup.getByRole("checkbox", { name: "1shortlink", exact: true }).waitFor();
    await popup.getByRole("checkbox", { name: "1shortlink", exact: true }).check();
    await popup.getByRole("checkbox", { name: "EZ4Short", exact: true }).uncheck(); await nativeState(worker, ["1short", "tech8s"]);
    assert.equal((await worker.evaluate(() => chrome.storage.local.get("autoOpen"))).autoOpen ?? false, false);
    assert.equal(await oneToggle.isChecked(), true);
    checks.push("Popup controls change services independently, synchronize the existing widget, and preserve auto-open preference");
    await visit(page, "https://www.ez4short.com/filter-alias?run=ez-off"); await panelState(page, "Đã tìm được trang đích"); await essentials("ez-off");
    assert.equal(await page.locator("#adskip-widget .destination").getAttribute("href"), target);
    assert.ok(count("ez-off", "pagead2.googlesyndication.com") >= 2);
    const ezToggle = page.locator("#adskip-widget").getByRole("checkbox", { name: "Chặn quảng cáo trên EZ4Short", exact: true });
    assert.equal(await ezToggle.isChecked(), false);
    await ezToggle.check(); await nativeState(worker, ["1short", "ez4short", "tech8s"]);
    await visit(page, "https://www.ez4short.com/filter-alias?run=ez-on"); await panelState(page, "Đã tìm được trang đích"); await essentials("ez-on");
    assert.equal(count("ez-on", "pagead2.googlesyndication.com"), 0);
    checks.push("EZ4 www alias exposes a final control with complete query/fragment; its own toggle governs Google advertising requests");
    await visit(page, "https://tech8s.net/article/?run=tech-on"); await panelState(page, "Cần thao tác trên trang"); await essentials("tech-on");
    assert.equal(count("tech-on", "pagead2.googlesyndication.com"), 0);
    checks.push("Tech8s keeps an explicit manual state while its service filter blocks advertising and preserves essential resources");
    await visit(page, "https://example.org/unrelated?run=external"); await essentials("external");
    await page.waitForFunction(() => window.__adScript === true); assert.ok(count("external", "3nbf4.com") >= 2);
    assert.equal(await page.locator("#adskip-widget").count(), 0); assert.equal(await page.locator("#ad-slot").isVisible(), true);
    checks.push("Unrelated site can load the same advertising domain and has no widget or cosmetic filtering");
    async function paste(url, expected) {
      await popup.locator("#link-input").fill(url); await popup.getByRole("button", { name: "Tìm trang đích", exact: true }).click();
      await popup.getByText("Đã tìm được trang đích", { exact: true }).waitFor(); assert.equal(await popup.locator("#destination").getAttribute("href"), expected);
    }
    await paste("https://ez4short.com/final-alias", target);
    assert.equal(exchanges.filter((item) => item.path === "/final-alias").length, 1);
    checks.push("Pasted EZ4 alias uses real service-worker GET and reads the enabled final control without a POST or file request");
    await paste("https://ez4short.com/redirected-alias", redirectTarget);
    assert.equal(exchanges.filter((item) => item.path === "/redirected-alias").length, 1);
    checks.push("Pasted EZ4 alias follows a real HTTPS 302 into /st and preserves the signed query");
    await visit(page, "https://ez4short.com/manual-alias"); await panelState(page, "Cần thao tác trên trang");
    assert.equal(await page.locator("#adskip-widget .destination").getAttribute("href"), "https://ez4short.com/manual-alias");
    await page.getByRole("button", { name: "Hoàn tất thao tác", exact: true }).click();
    await page.locator("#adskip-widget").getByRole("button", { name: "Tiếp tục kiểm tra", exact: true }).click();
    await panelState(page, "Đã tìm được trang đích"); assert.equal(await page.locator("#adskip-widget .destination").getAttribute("href"), target);
    assert.equal(exchanges.filter((item) => item.path === "/manual-alias").length, 1);
    checks.push("Locked EZ4 control stays manual, then Continue reads freshly enabled DOM without an extra GET or any POST");
    fs.mkdirSync(path.join(root, "work/qa"), { recursive: true });
    await page.screenshot({ path: path.join(root, "work/qa/extension-v03-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await page.locator("#adskip-widget").boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.screenshot({ path: path.join(root, "work/qa/extension-v03-mobile.png") });
    await popup.setViewportSize({ width: 360, height: 800 });
    await popup.screenshot({ path: path.join(root, "work/qa/extension-v03-popup.png"), fullPage: true });
    assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    checks.push("Widget fits 390 × 844; popup has no horizontal overflow at 360px and shows all service choices");
    await popup.getByRole("checkbox", { name: "1shortlink", exact: true }).uncheck();
    await popup.getByRole("checkbox", { name: "Tech8s", exact: true }).uncheck(); await nativeState(worker, ["ez4short"]);
    report.browser = context.browser().version();
    await context.close(); context = await playwright().chromium.launchPersistentContext(profile, options);
    worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker"); await nativeState(worker, ["ez4short"]);
    const stored = (await worker.evaluate(() => chrome.storage.local.get("adFilters"))).adFilters;
    assert.deepEqual(stored, { "1short": false, ez4short: true, tech8s: false });
    checks.push("A real browser restart retains the three stored preferences and the matching enabled native rulesets");
    assert.equal(exchanges.filter((item) => item.method === "POST").length, 0); assert.deepEqual(errors, []);
    report.outcome = "PASS";
  } catch (error) {
    report.failure = error.message;
    const active = context?.pages().at(-1);
    if (active && !active.isClosed()) await active.screenshot({ path: path.join(root, "work/qa/extension-v03-failure.png"), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(root, "work/extension-v03-result.json"), JSON.stringify(report, null, 2));
    await context?.close(); await fixture.close();
  }
  console.log(JSON.stringify({ ...report, exchanges: exchanges.length }, null, 2));
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
