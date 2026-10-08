"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { playwright, browserOptions } = require("./helpers.cjs");
const root = path.resolve(__dirname, "..");
const input = "https://1shortlink.com/link-encrypted/fixture";
const target = "https://vexfile.com/download/fixture?signature=a%2Fb%2Bc%3D&part=2";
const intermediary = "https://1shortlink.com/redirect-link?link=fixture";
const st = "https://ez4short.com/st?api=publisher-placeholder&url=" + target;
const pages = {
  one: '<!doctype html><html><head><title>1short fixture</title></head><body><h1>Confirm continue</h1><button id="redirect-link">Continue</button><script>getLink("/get-link-download", "fixture", "encrypted_link", "fixture-csrf")</script></body></html>',
  empty: "<!doctype html><html><body><h1>Article fixture</h1></body></html>"
};
const gmShim = `
window.__qaRequests=[];window.__qaClipboard=null;window.__qaPreferences={};
window.GM_getValue=(key,fallback)=>window.__qaPreferences[key]??fallback;
window.GM_setValue=(key,value)=>{window.__qaPreferences[key]=value};
window.GM_setClipboard=(text)=>{window.__qaClipboard=text};
window.GM_xmlhttpRequest=(config)=>{
 let aborted=false; window.__qaRequests.push({url:config.url,method:config.method});
 window.__qaGMRequest({url:config.url,method:config.method,data:config.data})
 .then(reply=>{if(!aborted)config.onload(reply)})
 .catch(()=>{if(!aborted)config.onerror()});
 return {abort(){aborted=true;config.onabort()}};
};`;

async function fixtures(context) {
  await context.route("**/*", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "content-type": "text/html;charset=utf-8" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers, body: "" });
    if (url.hostname === "1shortlink.com" && url.pathname === "/get-link-download") {
      assert.equal(new URLSearchParams(request.postData()).get("_token"), "fixture-csrf");
      return route.fulfill({ status: 200, headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ status: "success", redirect_url: intermediary }) });
    }
    if (url.hostname === "1shortlink.com" && url.pathname === "/redirect-link") return route.fulfill({ status: 302, headers: { ...headers, location: st }, body: "" });
    return route.fulfill({ status: 200, headers, body: url.hostname === "1shortlink.com" ? pages.one : pages.empty });
  });
}
async function goto(page, url) { try { await page.goto(url, { waitUntil: "commit", timeout: 15000 }); } catch (error) { if (!/ERR_ABORTED/.test(error.message)) throw error; } }
async function waitForPanel(page, text) {
  try { await page.locator("#adskip-widget").getByText(text, { exact: true }).waitFor({ timeout: 20000 }); }
  catch (error) {
    console.error("Panel diagnostics:", await page.evaluate(() => ({
      url: location.href, ready: document.readyState,
      panel: document.getElementById("adskip-widget")?.shadowRoot?.textContent?.slice(-1600),
      requests: window.__qaRequests,
      core: !!window.AdSkipCore, panelModule: !!window.AdSkipPanel
    })));
    throw error;
  }
}

(async () => {
  const browser = await playwright().chromium.launch({ headless: true, ...browserOptions() });
  const checks = []; const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await fixtures(context);
    await context.exposeBinding("__qaGMRequest", async (_source, config) => {
      if (new URL(config.url).pathname === "/get-link-download") {
        assert.equal(new URLSearchParams(config.data).get("_token"), "fixture-csrf");
        return { status: 200, finalUrl: config.url, responseText: JSON.stringify({ status: "success", redirect_url: intermediary }) };
      }
      if (config.url === intermediary) return { status: 200, finalUrl: st, responseText: "" };
      throw new Error("Unexpected GM request");
    });
    await context.addInitScript({ content: gmShim + "\n" + fs.readFileSync(path.join(root, "dist/adskip.user.js"), "utf8") });
    const page = await context.newPage();
    page.on("pageerror", (error) => { if (!/getLink is not defined/.test(error.message)) errors.push(error.message); });
    await goto(page, input);
    await waitForPanel(page, "Đã tìm được trang đích");
    assert.equal(await page.locator("#adskip-widget .destination").getAttribute("href"), target);
    assert.equal((await page.evaluate(() => window.__qaRequests)).length, 2);
    checks.push("Userscript: DOM/page init → GM POST/redirect contract (mock) → complete signed destination");
    await page.locator("#adskip-widget").getByRole("button", { name: "Sao chép", exact: true }).click();
    assert.equal(await page.evaluate(() => window.__qaClipboard), target);
    checks.push("Userscript: copy preserves the full URL");
    await page.locator("#adskip-widget").getByRole("button", { name: "Thu gọn", exact: true }).click();
    await page.locator("#adskip-widget").getByRole("button", { name: "Mở bảng AdSkip", exact: true }).click();
    checks.push("Userscript: collapse and restore");
    fs.mkdirSync(path.join(root, "work/qa"), { recursive: true });
    await page.screenshot({ path: path.join(root, "work/qa/userscript-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await page.locator("#adskip-widget").boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.screenshot({ path: path.join(root, "work/qa/userscript-mobile.png") });
    checks.push("Userscript: widget fits 390 × 844");
    const direct = await context.newPage(); await goto(direct, st);
    await waitForPanel(direct, "Đã tìm được trang đích");
    assert.equal(await direct.locator("#adskip-widget .destination").getAttribute("href"), target);
    checks.push("Userscript: document-start captures /st target before page scripts");
    const article = await context.newPage(); await goto(article, "https://tech8s.net/article/");
    await waitForPanel(article, "Cần thao tác trên trang");
    assert.match(await article.locator("#adskip-widget .message").innerText(), /Bắt đầu từ link/);
    checks.push("Userscript: bare Tech8s article gives an actionable manual state");
    assert.deepEqual(errors, []);
    await context.close();
    const report = { checkedAt: new Date().toISOString(), mode: "Chromium with intercepted fixtures and GM API shim; not an installed Tampermonkey test", checks, errors };
    fs.writeFileSync(path.join(root, "work/browser-result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
