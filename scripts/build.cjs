"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const vm = require("node:vm");
for (const directory of ["src", "scripts", "tests", "extension"]) {
  const folder = path.join(root, directory);
  if (!fs.existsSync(folder)) continue;
  for (const filename of fs.readdirSync(folder).filter((name) => /\.(?:c?js)$/.test(name))) {
    new vm.Script(fs.readFileSync(path.join(folder, filename), "utf8"), { filename: directory + "/" + filename });
  }
}
const read = (name) => fs.readFileSync(path.join(root, "src", name), "utf8");
const dist = path.join(root, "dist");
fs.mkdirSync(dist, { recursive: true });
const header = `// ==UserScript==
// @name         AdSkip: 1short & EZ4Short
// @namespace    local.adskip
// @version      0.3.0
// @description  Tìm trang đích của 1shortlink, EZ4Short và ẩn khung quảng cáo theo dịch vụ.
// @match        https://1shortlink.com/*
// @match        https://www.1shortlink.com/*
// @match        https://ez4short.com/*
// @match        https://www.ez4short.com/*
// @match        https://tech8s.net/*
// @match        https://www.tech8s.net/*
// @connect      1shortlink.com
// @connect      www.1shortlink.com
// @connect      ez4short.com
// @connect      www.ez4short.com
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_addValueChangeListener
// @run-at       document-start
// @noframes
// ==/UserScript==
`;
const shared = ["core.js", "adapters.js", "resolver.js", "ads.js", "panel.js"].map(read).join("\n\n");
fs.writeFileSync(path.join(dist, "adskip.user.js"), header + "\n(function () {\n" + shared + "\n" + read("userscript-entry.js") + "\n})();\n", "utf8");
const extension = path.join(root, "extension");
if (fs.existsSync(path.join(extension, "manifest.json"))) {
  for (const name of ["core.js", "adapters.js", "resolver.js", "fetch-transport.js", "ads.js", "ad-settings.js", "panel.js"]) fs.writeFileSync(path.join(extension, name), read(name));
  const Ads = require("../src/ads.js");
  const rules = path.join(extension, "rules"); fs.mkdirSync(rules, { recursive: true });
  for (const service of Ads.services) fs.writeFileSync(path.join(rules, service.id + ".json"), JSON.stringify(Ads.rules(service), null, 2) + "\n");
}
console.log("Built dist/adskip.user.js" + (fs.existsSync(path.join(extension, "manifest.json")) ? " and extension shared modules" : ""));
