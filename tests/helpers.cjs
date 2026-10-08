"use strict";
const path = require("node:path");
function playwright() {
  try { return require("playwright"); }
  catch (error) {
    if (process.env.ADSKIP_PLAYWRIGHT_PATH) return require(path.resolve(process.env.ADSKIP_PLAYWRIGHT_PATH));
    throw new Error("Install dev dependencies with npm install, or set ADSKIP_PLAYWRIGHT_PATH to a Playwright package directory.", { cause: error });
  }
}
function browserOptions() { return process.env.ADSKIP_BROWSER_PATH ? { executablePath: process.env.ADSKIP_BROWSER_PATH } : {}; }
module.exports = { playwright, browserOptions };
