"use strict";
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../src/core.js");
const { resolve } = require("../src/resolver.js");
const { playwright } = require("./helpers.cjs");

(async () => {
  const input = process.argv[2] || process.env.ADSKIP_LIVE_URL;
  if (!input) throw new Error("Supply one URL as the argument or ADSKIP_LIVE_URL. This test makes real requests to that link.");
  const start = Core.urlOf(input).href;
  const context = await playwright().request.newContext({ timeout: 15000 });
  const exchanges = [];
  let result;
  try {
    result = await resolve(start, { request: async (url, config = {}) => {
      const response = await context.fetch(url, {
        method: config.method || "GET", maxRedirects: 6,
        form: config.fields,
        headers: config.method === "POST" ? { "X-Requested-With": "XMLHttpRequest", Referer: start, Accept: "application/json" } : { Accept: "text/html" }
      });
      const finalUrl = response.url();
      exchanges.push({ method: config.method || "GET", request: Core.describeUrl(url), status: response.status(), final: Core.describeUrl(finalUrl) });
      const text = Core.ez4Destination(finalUrl) || Core.isFileHost(finalUrl) ? "" : await response.text();
      return { status: response.status(), finalUrl, text };
    } });
  } finally { await context.dispose(); }
  const report = { checkedAt: new Date().toISOString(), scope: exchanges.length ? "Real HTTP protocol through Playwright APIRequestContext; no CAPTCHA solving and no file download." : "Supplied real URL decoded locally; no HTTP request and no file download.", input: Core.describeUrl(start), result, exchanges };
  fs.mkdirSync(path.join(__dirname, "../work"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "../work/live-result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (result.phase !== "resolved") process.exitCode = 1;
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
