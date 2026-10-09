"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { playwright, browserOptions } = require("./helpers.cjs");
const { fixtureServer, bodyOf } = require("./https-fixture.cjs");
const root = path.resolve(__dirname, "..");
const input = "https://1shortlink.com/link-encrypted/tamper-fixture";
const next = "https://1shortlink.com/redirect-link?link=tamper-fixture";
const target = "https://vexfile.com/download/tamper-fixture?sig=a%2Fb%2Bc%3D&part=2";
const st = "https://ez4short.com/st?api=fixture&url=" + target;
async function visit(page, url) { try { await page.goto(url, { waitUntil: "commit", timeout: 15000 }); } catch (error) { if (!/ERR_ABORTED/.test(error.message)) throw error; } }
async function panelStatus(page, title) { await page.locator("#adskip-widget").getByText(title, { exact: true }).waitFor({ timeout: 25000 }); }

(async () => {
  const manager = path.resolve(process.env.ADSKIP_TAMPERMONKEY_PATH || path.join(root, "work/tampermonkey"));
  if (!fs.existsSync(path.join(manager, "manifest.json"))) throw new Error("Supply an official unpacked Tampermonkey package through ADSKIP_TAMPERMONKEY_PATH.");
  const bundle = fs.readFileSync(path.join(root, "dist/adskip.user.js"), "utf8");
  const exchanges = []; const checks = []; const errors = [];
  const fixture = await fixtureServer(async (req, res, url) => {
    exchanges.push({ host: url.hostname, method: req.method, path: url.pathname });
    const reply = (status, body, headers = {}) => { res.writeHead(status, { "content-type": "text/html;charset=utf-8", ...headers }); res.end(body); };
    if (url.pathname === "/get-link-download") {
      const fields = new URLSearchParams(await bodyOf(req));
      assert.equal(fields.get("_token"), "fresh-fixture-csrf");
      assert.ok((req.headers.cookie || "").includes("adskip-fixture=session"));
      return reply(200, JSON.stringify({ status: "success", redirect_url: next }), { "content-type": "application/json" });
    }
    if (url.pathname === "/redirect-link") return reply(302, "", { location: st });
    if (url.pathname === "/link-encrypted/tamper-fixture") return reply(200, '<!doctype html><html><body><h1>1short fixture</h1><button id="redirect-link">Continue</button><script>function getLink(){}getLink("/get-link-download","fixture","encrypted_link","fresh-fixture-csrf");</script></body></html>', { "set-cookie": "adskip-fixture=session; Path=/; Secure; SameSite=None" });
    if (url.pathname === "/link-encrypted/manual") return reply(200, '<!doctype html><html><body><h1>Manual fixture</h1><button id="verify">Hoàn tất thao tác</button><script>document.getElementById("verify").addEventListener("click",()=>{const button=document.createElement("button");button.id="redirect-link";button.setAttribute("data-href",' + JSON.stringify(st) + ');document.body.append(button);});</script></body></html>');
    if (url.pathname === "/alias-final") return reply(200, '<html><body><a class="get-link" href="' + target.replaceAll("&", "&amp;") + '#fragment">Get link</a><iframe id="ad-frame" title="Advertisement fixture" src="https://pagead2.googlesyndication.com/frame"></iframe><iframe id="captcha-frame" title="Verification fixture" src="https://challenges.cloudflare.com/frame"></iframe><ins id="ad-slot" class="adsbygoogle" style="display:block;width:200px;height:40px">Ad fixture</ins></body></html>');
    if (url.pathname === "/alias-redirect") return reply(302, "", { location: st });
    if (url.pathname === "/alias-manual") return reply(200, '<html><body><a class="get-link disabled" id="get-link" href="' + target.replaceAll("&", "&amp;") + '">Wait</a><button id="verify">Hoàn tất thao tác</button><script>document.getElementById("verify").onclick=()=>document.getElementById("get-link").classList.remove("disabled");</script></body></html>');
    return reply(200, "<!doctype html><html><body><h1>Fixture</h1></body></html>");
  }, ["pagead2.googlesyndication.com", "challenges.cloudflare.com"]);
  const profile = fs.mkdtempSync(path.join(root, "work/tampermonkey-test-profile-"));
  const context = await playwright().chromium.launchPersistentContext(profile, {
    headless: true, channel: "chromium", ...browserOptions(), viewport: { width: 1440, height: 900 },
    args: ["--disable-extensions-except=" + manager, "--load-extension=" + manager, ...fixture.browserArgs]
  });
  const report = { checkedAt: new Date().toISOString(), mode: "Official Tampermonkey installed unpacked in isolated Chromium; bundle saved through its editor; real GM APIs and local HTTPS fixture server; test certificate and browser-only host mapping", outcome: "FAIL", checks, errors, exchanges };
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const id = worker.url().split("/")[2];
    const options = await context.newPage();
    await options.goto("chrome://extensions/"); await options.locator("#devMode").waitFor();
    if (!await options.locator("#devMode").evaluate((node) => node.checked)) await options.locator("#devMode").click();
    await options.goto("chrome://extensions/?id=" + id);
    await options.getByText("Allow User Scripts", { exact: false }).waitFor();
    const allow = options.locator("#allow-user-scripts cr-toggle");
    if (!await allow.evaluate((node) => node.checked)) await allow.click();
    await options.goto("chrome-extension://" + id + "/options.html");
    await options.getByText("Installed Userscripts", { exact: true }).click();
    await options.getByTitle("Create a new script...", { exact: true }).click();
    await options.locator(".CodeMirror").click();
    await options.keyboard.press("Control+A"); await options.keyboard.insertText(bundle);
    await options.keyboard.press("Control+S");
    await options.getByText("AdSkip: 1short & EZ4Short", { exact: true }).first().waitFor();
    checks.push("Bundle installed through Tampermonkey's real editor and native userscript permission");
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    await visit(page, input); await panelStatus(page, "Đã tìm được trang đích");
    assert.equal(await page.locator("#adskip-widget .destination").getAttribute("href"), target);
    assert.equal(exchanges.filter((item) => item.method === "POST").length, 1);
    checks.push("Real GM_xmlhttpRequest POST includes current CSRF and session cookie, follows redirect and preserves signed destination");
    await page.screenshot({ path: path.join(root, "work/qa/tampermonkey-v03-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await page.locator("#adskip-widget").boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.screenshot({ path: path.join(root, "work/qa/tampermonkey-v03-mobile.png") });
    checks.push("Installed Tampermonkey widget fits 390 × 844");
    const manual = await context.newPage(); manual.on("pageerror", (error) => errors.push(error.message));
    await visit(manual, "https://1shortlink.com/link-encrypted/manual"); await panelStatus(manual, "Cần thao tác trên trang");
    await manual.getByRole("button", { name: "Hoàn tất thao tác", exact: true }).click();
    await manual.locator("#adskip-widget").getByRole("button", { name: "Tiếp tục kiểm tra", exact: true }).click();
    await panelStatus(manual, "Đã tìm được trang đích");
    assert.equal(await manual.locator("#adskip-widget .destination").getAttribute("href"), target);
    checks.push("Installed userscript continues with new DOM after manual action");
    const embeddedTarget = "https://gofile.io/d/tamper-fixture?sig=a%2Bb%3D#fragment";
    const fullPages = "https://1shortlink.com/api/v1/full-pages?api_key=fixture&url=" + Buffer.from(embeddedTarget).toString("base64") + "&type=2";
    const embedded = await context.newPage(); await visit(embedded, fullPages); await panelStatus(embedded, "Đã tìm được trang đích");
    assert.equal(await embedded.locator("#adskip-widget .destination").getAttribute("href"), embeddedTarget);
    checks.push("Installed userscript decodes full-pages and keeps the fragment without a GM request");
    const alias = await context.newPage(); alias.on("pageerror", (error) => errors.push(error.message));
    await visit(alias, "https://ez4short.com/alias-final"); await panelStatus(alias, "Đã tìm được trang đích");
    assert.equal(await alias.locator("#adskip-widget .destination").getAttribute("href"), target + "#fragment");
    await alias.frameLocator("#captcha-frame").getByText("Fixture", { exact: true }).waitFor();
    assert.equal(await alias.locator("#ad-frame").isVisible(), false); assert.equal(await alias.locator("#ad-slot").isVisible(), false);
    assert.equal(await alias.locator("#captcha-frame").isVisible(), true);
    assert.ok(exchanges.some((item) => item.host === "pagead2.googlesyndication.com" && item.path === "/frame"));
    checks.push("Real userscript reads enabled EZ4 alias control with signed query/fragment; cosmetic filtering hides advertising frames/slots but leaves verification visible and does not block network requests");
    const adToggle = alias.locator("#adskip-widget").getByRole("checkbox", { name: "Ẩn khung quảng cáo trên EZ4Short", exact: true });
    await adToggle.uncheck(); await alias.locator("#ad-frame").waitFor({ state: "visible" });
    assert.equal(await alias.locator("#ad-slot").isVisible(), true);
    const another = await context.newPage(); await visit(another, "https://ez4short.com/alias-final"); await panelStatus(another, "Đã tìm được trang đích");
    const otherToggle = another.locator("#adskip-widget").getByRole("checkbox", { name: "Ẩn khung quảng cáo trên EZ4Short", exact: true });
    assert.equal(await otherToggle.isChecked(), false); assert.equal(await another.locator("#ad-slot").isVisible(), true);
    await adToggle.check(); await another.locator("#ad-slot").waitFor({ state: "hidden" });
    assert.equal(await otherToggle.isChecked(), true);
    checks.push("Real GM storage persists the per-service choice; turning it off restores elements and GM value-change listeners synchronize another open tab");
    await alias.evaluate(() => { const frame = document.createElement("iframe"); frame.id = "dynamic-ad"; frame.src = "https://pagead2.googlesyndication.com/frame"; document.body.append(frame); });
    await alias.waitForFunction(() => document.getElementById("dynamic-ad").getAttribute("data-adskip-ad-hidden") === "true");
    await alias.evaluate(() => { document.getElementById("dynamic-ad").src = "https://challenges.cloudflare.com/frame"; });
    await alias.locator("#dynamic-ad").waitFor({ state: "visible" });
    checks.push("Mutation filtering hides a newly inserted ad frame and restores it when its source changes to a verification resource");
    await alias.screenshot({ path: path.join(root, "work/qa/tampermonkey-v03-alias.png") });
    const redirected = await context.newPage(); await visit(redirected, "https://ez4short.com/alias-redirect"); await panelStatus(redirected, "Đã tìm được trang đích");
    assert.equal(await redirected.locator("#adskip-widget .destination").getAttribute("href"), target);
    checks.push("Real installed userscript captures an EZ4 alias HTTP redirect into /st");
    const locked = await context.newPage(); await visit(locked, "https://ez4short.com/alias-manual"); await panelStatus(locked, "Cần thao tác trên trang");
    await locked.getByRole("button", { name: "Hoàn tất thao tác", exact: true }).click();
    await locked.locator("#adskip-widget").getByRole("button", { name: "Tiếp tục kiểm tra", exact: true }).click(); await panelStatus(locked, "Đã tìm được trang đích");
    assert.equal(await locked.locator("#adskip-widget .destination").getAttribute("href"), target);
    checks.push("Real installed userscript keeps a locked EZ4 alias manual and resolves only after user action and fresh DOM continuation");
    assert.deepEqual(errors, []);
    report.browser = context.browser().version(); report.managerVersion = JSON.parse(fs.readFileSync(path.join(manager, "manifest.json"), "utf8")).version; report.outcome = "PASS";
    report.profile = path.relative(root, profile);
  } catch (error) {
    report.failure = error.message;
    const active = context.pages().at(-1);
    if (active && !active.isClosed()) await active.screenshot({ path: path.join(root, "work/qa/tampermonkey-failure.png") }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(root, "work/tampermonkey-result.json"), JSON.stringify(report, null, 2));
    await context.close(); await fixture.close();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
