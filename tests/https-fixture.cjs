"use strict";
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
async function fixtureServer(handler) {
  const keyPath = path.join(root, "work/fixture-key.pem");
  const certPath = path.join(root, "work/fixture-cert.pem");
  fs.mkdirSync(path.join(root, "work"), { recursive: true });
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    const candidates = [process.env.ADSKIP_OPENSSL_PATH, "openssl", "C:/Program Files/Git/usr/bin/openssl.exe"].filter(Boolean);
    let created = false;
    for (const executable of candidates) {
      const result = spawnSync(executable, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "2", "-subj", "/CN=adskip-fixture.local"], { windowsHide: true, encoding: "utf8" });
      if (result.status === 0) { created = true; break; }
    }
    if (!created) throw new Error("OpenSSL is needed for HTTPS fixtures; set ADSKIP_OPENSSL_PATH.");
  }
  const server = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, (request, response) => {
    const url = new URL(request.url, "https://" + request.headers.host);
    Promise.resolve(handler(request, response, url)).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end("Fixture handler failed");
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  const hosts = ["1shortlink.com", "www.1shortlink.com", "ez4short.com", "www.ez4short.com", "tech8s.net", "www.tech8s.net", "vexfile.com", "gofile.io", "example.org"];
  return {
    browserArgs: ["--host-resolver-rules=" + hosts.map((host) => "MAP " + host + " 127.0.0.1:" + port).join(","), "--ignore-certificate-errors"],
    close() { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); }
  };
}
async function bodyOf(request) {
  let body = "";
  for await (const chunk of request) { body += chunk; if (body.length > 1048576) throw new Error("Fixture request too large"); }
  return body;
}
module.exports = { fixtureServer, bodyOf };
