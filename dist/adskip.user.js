// ==UserScript==
// @name         AdSkip: 1short & EZ4Short
// @namespace    local.adskip
// @version      0.2.0
// @description  Tìm trang đích của các dạng 1shortlink và EZ4Short đã kiểm chứng.
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
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
/* Shared URL rules. No evaluation of page JavaScript or encrypted payloads. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AdSkipCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "0.2.0";
  const SERVICE_HOSTS = new Set(["1shortlink.com", "www.1shortlink.com", "ez4short.com", "www.ez4short.com", "tech8s.net", "www.tech8s.net"]);
  const FILE_HOSTS = ["vexfile.com", "gofile.io", "gofile.me", "disk.yandex.ru", "disk.yandex.com", "yadi.sk"];

  class AdSkipError extends Error {
    constructor(code, message) { super(message); this.name = "AdSkipError"; this.code = code; }
  }
  function urlOf(value, base) {
    if (typeof value !== "string" || !value.trim() || value.length > 16384 || /[\u0000-\u0020\u007f]/.test(value.trim())) {
      throw new AdSkipError("INVALID_URL", "Địa chỉ không hợp lệ.");
    }
    let parsed;
    try { parsed = new URL(value.trim(), base); }
    catch { throw new AdSkipError("INVALID_URL", "Không đọc được địa chỉ này."); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new AdSkipError("UNSAFE_URL", "Chỉ hỗ trợ URL HTTPS không chứa thông tin đăng nhập.");
    }
    return parsed;
  }
  function hostIs(host, suffix) { return host === suffix || host.endsWith("." + suffix); }
  function isFileHost(input) {
    const host = typeof input === "string" ? urlOf(input).hostname : input.hostname;
    return FILE_HOSTS.some((allowed) => hostIs(host, allowed));
  }
  function serviceOf(input) {
    const url = typeof input === "string" ? urlOf(input) : input;
    if (["1shortlink.com", "www.1shortlink.com"].includes(url.hostname)) return "1short";
    if (["ez4short.com", "www.ez4short.com"].includes(url.hostname)) return "ez4short";
    if (["tech8s.net", "www.tech8s.net"].includes(url.hostname)) return "tech8s";
    return isFileHost(url) ? "destination" : "unknown";
  }
  function describeUrl(input) {
    const url = urlOf(input);
    // Never put publisher API keys, CSRF values or ciphertext into the UI trace.
    if (url.pathname.startsWith("/link-encrypted/")) return url.hostname + "/link-encrypted/…";
    return url.hostname + (url.pathname.length > 100 ? url.pathname.slice(0, 100) + "…" : url.pathname);
  }
  function visitKey(input) { const url = urlOf(input); url.hash = ""; return url.href; }
  function inputUrl(value) {
    const url = urlOf(value);
    if (serviceOf(url) === "unknown" || (url.port && url.port !== "443")) {
      throw new AdSkipError("UNSUPPORTED_INPUT", "Dán link 1shortlink, EZ4Short, Tech8s hoặc trang đích được hỗ trợ.");
    }
    return url.href;
  }
  function canContinue(state) {
    return state?.phase === "manual" && ["NEEDS_VERIFICATION", "SESSION_EXPIRED", "NON_JSON", "LINK_UNAVAILABLE", "FORM_NOT_FOUND", "EZ4_ALIAS"].includes(state.code);
  }
  function oneShortDestination(input) {
    const page = urlOf(input);
    if (serviceOf(page) !== "1short" || !/^\/api\/v1\/full-pages\/?$/.test(page.pathname)) return null;
    const values = [...page.search.slice(1).matchAll(/(?:^|&)url=([^&]*)/g)];
    if (!values.length) return null;
    if (values.length !== 1) throw new AdSkipError("AMBIGUOUS_TARGET", "Link 1short chứa nhiều tham số URL đích.");
    let decoded;
    try {
      const encoded = decodeURIComponent(values[0][1]);
      if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("Invalid Base64");
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)));
    } catch { throw new AdSkipError("BAD_ENCODING", "Tham số URL của link full-pages bị lỗi mã hóa Base64."); }
    return urlOf(decoded).href;
  }
  function decodeEntities(text) {
    return text.replace(/&amp;|&quot;|&#39;|&#x([0-9a-f]+);|&#(\d+);/gi, (all, hex, decimal) => {
      if (all.toLowerCase() === "&amp;") return "&";
      if (all.toLowerCase() === "&quot;") return '"';
      if (all === "&#39;") return "'";
      const number = parseInt(hex || decimal, hex ? 16 : 10);
      return number <= 0x10ffff ? String.fromCodePoint(number) : all;
    });
  }
  function ez4Destination(input) {
    const page = urlOf(input);
    if (serviceOf(page) !== "ez4short" || !/^\/st\/?$/.test(page.pathname)) return null;
    const match = /(?:^|&)url=/.exec(page.search.slice(1));
    if (!match) return null;
    let value = page.search.slice(1).slice(match.index + match[0].length);
    if (!value) throw new AdSkipError("EMPTY_TARGET", "EZ4Short chưa cung cấp URL đích.");
    // The observed /st script treats the entire raw tail after &url= as the
    // destination. Preserve nested & and + in raw URLs and signed parameters.
    // An encoded outer query value ends at the next outer separator.
    if (/^https:\/\//i.test(value)) value += page.hash;
    else value = value.split("&", 1)[0];
    for (let depth = 0; depth < 3 && !/^https?:\/\//i.test(value); depth++) {
      try { value = decodeURIComponent(value); }
      catch { throw new AdSkipError("BAD_ENCODING", "Tham số URL của EZ4Short bị lỗi mã hóa."); }
    }
    return urlOf(value).href;
  }
  function oneShortInit(html, pageUrl) {
    const page = urlOf(pageUrl);
    if (serviceOf(page) !== "1short") return null;
    const literal = '"(?:\\\\.|[^"\\\\])*"';
    const pattern = new RegExp('\\bgetLink\\s*\\(\\s*(' + literal + ')\\s*,\\s*(' + literal + ')\\s*,\\s*(' + literal + ')\\s*,\\s*(' + literal + ')\\s*\\)', "g");
    let match;
    while ((match = pattern.exec(html))) {
      let values;
      try { values = match.slice(1).map((item) => JSON.parse(item)); }
      catch { continue; }
      const endpoint = urlOf(values[0], page.href);
      if (endpoint.origin !== page.origin || endpoint.pathname !== "/get-link-download" || endpoint.search || endpoint.hash) {
        throw new AdSkipError("ENDPOINT_CHANGED", "Trang đã thay đổi địa chỉ lấy link. Cần cập nhật bộ xử lý 1short.");
      }
      if (!values[1] || values[1].length > 16384 || !values[2] || values[2].length > 64 || !values[3] || values[3].length > 512) {
        throw new AdSkipError("INVALID_FORM", "Dữ liệu lấy link không đầy đủ.");
      }
      return { endpoint: endpoint.href, fields: { url: values[1], type: values[2], _token: values[3] } };
    }
    return null;
  }
  function oneShortReply(body, pageUrl) {
    let data;
    try { data = typeof body === "string" ? JSON.parse(body) : body; }
    catch { throw new AdSkipError("NON_JSON", "Trang trả nội dung xác minh hoặc HTML thay cho kết quả lấy link."); }
    if (!data || data.status !== "success" || typeof data.redirect_url !== "string" || !data.redirect_url) {
      throw new AdSkipError("LINK_UNAVAILABLE", "1short chưa trả URL kế tiếp. Kiểm tra link hoặc hoàn tất bước xác minh trên trang.");
    }
    return urlOf(data.redirect_url, pageUrl).href;
  }
  function buttonCandidate(html, pageUrl) {
    for (const tag of html.match(/<[^>]*\bid=["']redirect-link["'][^>]*>/gi) || []) {
      const match = /\bdata-href=["']([^"']+)["']/i.exec(tag);
      if (match) return urlOf(decodeEntities(match[1]), pageUrl).href;
    }
    return null;
  }
  function canRequest(input, method = "GET") {
    const url = urlOf(input);
    if (serviceOf(url) !== "1short" || (url.port && url.port !== "443")) return false;
    if (method === "POST") return url.pathname === "/get-link-download" && !url.search && !url.hash;
    return method === "GET" && (url.pathname === "/redirect-link" || url.pathname.startsWith("/link-encrypted/") || /^\/ll\/[^/]+\/?$/.test(url.pathname));
  }
  function httpError(response) {
    if ([401, 403].includes(response.status)) return new AdSkipError("NEEDS_VERIFICATION", "Trang yêu cầu xác minh. Hoàn tất thao tác trên trang rồi tiếp tục kiểm tra.");
    if (response.status === 419) return new AdSkipError("SESSION_EXPIRED", "Phiên hoặc token đã hết hạn. Tải lại trang, hoàn tất thao tác rồi tiếp tục kiểm tra.");
    if (response.status === 429) return new AdSkipError("RATE_LIMITED", "Dịch vụ đang giới hạn lượt truy cập. Chờ một lúc rồi chọn Tìm lại.");
    if (response.status === 503) return new AdSkipError("SERVICE_UNAVAILABLE", "Dịch vụ tạm thời không phản hồi. Thử lại sau.");
    if ([404, 410].includes(response.status)) return new AdSkipError("EXPIRED_LINK", "Link không còn tồn tại hoặc đã hết hạn.");
    if (response.status < 200 || response.status >= 300) return new AdSkipError("HTTP_ERROR", "Trang trung gian trả HTTP " + response.status + ". Thử lại sau.");
    return null;
  }
  return { VERSION, SERVICE_HOSTS, FILE_HOSTS, AdSkipError, urlOf, hostIs, isFileHost, serviceOf, describeUrl, visitKey, inputUrl, canContinue, oneShortDestination, decodeEntities, ez4Destination, oneShortInit, oneShortReply, buttonCandidate, canRequest, httpError };
});


(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.AdSkipResolver = factory(root.AdSkipCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  async function resolve(startUrl, options = {}) {
    const steps = [];
    const visited = new Set();
    const maxHops = options.maxHops || 8;
    const emit = (label, url) => {
      const step = { label, url: Core.describeUrl(url) };
      steps.push(step);
      if (options.onStep) options.onStep(step, steps.slice());
    };
    const finish = (phase, message, url, code = null) => ({ phase, message, url, code, steps });
    const request = async (url, config = {}) => {
      if (options.signal && options.signal.aborted) throw new Core.AdSkipError("CANCELLED", "Đã dừng xử lý.");
      if (!Core.canRequest(url, config.method || "GET")) throw new Core.AdSkipError("REQUEST_DENIED", "Bước này chưa có bộ xử lý được hỗ trợ.");
      if (!options.request) throw new Core.AdSkipError("NO_TRANSPORT", "Không có kết nối tới trang trung gian.");
      const reply = await options.request(url, { ...config, signal: options.signal });
      if (options.signal && options.signal.aborted) throw new Core.AdSkipError("CANCELLED", "Đã dừng xử lý.");
      if (reply.text && reply.text.length > 1048576) throw new Core.AdSkipError("RESPONSE_TOO_LARGE", "Phản hồi trang quá lớn để xử lý.");
      return reply;
    };
    let cursor;
    try {
      cursor = Core.urlOf(startUrl).href;
      for (let hop = 0; hop < maxHops; hop++) {
        if (options.signal && options.signal.aborted) return finish("stopped", "Đã dừng xử lý.", null, "CANCELLED");
        const key = Core.visitKey(cursor);
        if (visited.has(key)) return finish("manual", "Chuỗi chuyển hướng quay lại cùng một link. Đã dừng để tránh vòng lặp.", cursor, "LOOP");
        visited.add(key);
        const service = Core.serviceOf(cursor);
        if (service === "destination") {
          emit("Đã tìm địa chỉ đích", cursor);
          return finish("resolved", "Đã tìm địa chỉ đích. Chưa kiểm tra tình trạng file.", cursor);
        }
        if (service === "ez4short") {
          const target = Core.ez4Destination(cursor);
          if (target) { emit("Đọc URL đích từ EZ4Short", cursor); cursor = target; continue; }
          emit("Cần thao tác trên EZ4Short", cursor);
          return finish("manual", "Dạng mã ngắn EZ4Short chưa được hỗ trợ. Hoàn tất bước trên trang; tool sẽ nhận URL nếu trang chuyển tới dạng /st có đích.", cursor, "EZ4_ALIAS");
        }
        if (service === "tech8s") {
          emit("Bài viết trung gian Tech8s", cursor);
          return finish("manual", "URL bài viết chưa đủ để xác định file. Bắt đầu từ link 1short hoặc EZ4Short gốc.", cursor, "ARTICLE_WITHOUT_CONTEXT");
        }
        if (service !== "1short") {
          emit("Gặp dịch vụ chưa hỗ trợ", cursor);
          return finish("manual", "Đã tìm được bước kế tiếp nhưng dịch vụ này chưa được hỗ trợ.", cursor, "UNSUPPORTED_HOST");
        }
        const embedded = Core.oneShortDestination(cursor);
        if (embedded) { emit("Đọc URL đích từ link full-pages", cursor); cursor = embedded; continue; }
        if (hop === 0 && options.initialCandidate) {
          emit("Đọc URL mà trang 1short đã nhận", cursor);
          cursor = Core.urlOf(options.initialCandidate, cursor).href;
          continue;
        }
        if (!Core.canRequest(cursor)) return finish("manual", "Dạng đường dẫn 1short này chưa được hỗ trợ.", cursor, "UNSUPPORTED_PATH");
        emit(Core.urlOf(cursor).pathname === "/redirect-link" ? "Theo chuyển hướng 1short" : "Đọc trang 1short", cursor);
        const page = hop === 0 && options.initialHtml ? { status: 200, finalUrl: cursor, text: options.initialHtml } : await request(cursor);
        if (page.finalUrl && Core.visitKey(page.finalUrl) !== key) { cursor = Core.urlOf(page.finalUrl).href; continue; }
        const pageError = Core.httpError(page);
        if (pageError) throw pageError;
        const candidate = Core.buttonCandidate(page.text || "", cursor);
        if (candidate) { cursor = candidate; continue; }
        const init = Core.oneShortInit(page.text || "", cursor);
        if (!init) return finish("manual", "Chưa thấy dữ liệu lấy link. Trang có thể yêu cầu mật khẩu, xác minh hoặc đã thay đổi giao diện.", cursor, "FORM_NOT_FOUND");
        emit("Yêu cầu URL kế tiếp từ 1short", cursor);
        const reply = await request(init.endpoint, { method: "POST", fields: init.fields });
        const replyError = Core.httpError(reply);
        if (replyError) throw replyError;
        cursor = Core.oneShortReply(reply.text, cursor);
      }
      return finish("manual", "Chuỗi vượt quá " + maxHops + " bước. Đã dừng xử lý.", cursor, "HOP_LIMIT");
    } catch (error) {
      const code = error.code || (error.name === "AbortError" ? "CANCELLED" : "NETWORK_ERROR");
      const message = error instanceof Core.AdSkipError ? error.message : code === "CANCELLED" ? "Đã dừng xử lý." : "Không kết nối được trang trung gian. Thử lại khi trang đã tải xong.";
      return finish(code === "CANCELLED" ? "stopped" : ["NEEDS_VERIFICATION", "SESSION_EXPIRED", "NON_JSON", "LINK_UNAVAILABLE"].includes(code) ? "manual" : "error", message, cursor || null, code);
    }
  }
  return { resolve };
});


(function (root) {
  "use strict";
  const Core = root.AdSkipCore;
  const css = `
    :host{all:initial;font-family:"Segoe UI",Tahoma,sans-serif;color:#172b4d;font-size:14px;color-scheme:light}
    *{box-sizing:border-box}button,a,input{font:inherit}button,a{touch-action:manipulation}
    .panel{width:min(368px,calc(100vw - 24px));background:#f7fafc;border:1px solid #c7d3e2;border-radius:12px;box-shadow:0 12px 40px #172b4d26;overflow:hidden}
    header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 18px;background:#e9f0fa;border-bottom:1px solid #c7d3e2}
    .brand{font-family:Bahnschrift,"Segoe UI",sans-serif;font-size:21px;font-weight:600;letter-spacing:-.4px}
    .collapse{border:0;background:transparent;color:#355278;cursor:pointer;padding:6px 9px;border-radius:5px}
    .body{padding:18px}.status{font-weight:600;margin:0 0 8px;display:flex;align-items:center;gap:8px}.dot{width:8px;height:8px;border-radius:50%;background:#5a687e;flex:none}
    .resolved .dot{background:#23765b}.manual .dot,.error .dot{background:#9a5b0b}.resolving .dot{background:#2b64c5}
    .message{margin:0;line-height:1.55;color:#5a687e}.destination{display:block;margin:14px 0 0;padding:10px 12px;background:white;border-left:3px solid #2b64c5;color:#172b4d;overflow-wrap:anywhere;font-size:13px;line-height:1.5;text-decoration:none}
    .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.button{display:inline-flex;align-items:center;justify-content:center;padding:9px 13px;border:1px solid #bcc9da;border-radius:6px;background:white;color:#172b4d;text-decoration:none;cursor:pointer;min-height:38px}
    .primary{background:#2b64c5;border-color:#2b64c5;color:white}.button:disabled{opacity:.55;cursor:wait}.button:hover:not(:disabled){filter:brightness(.96)}
    :focus-visible{outline:3px solid #86ade8;outline-offset:3px}.preferences{display:flex;gap:8px;align-items:flex-start;margin-top:17px;color:#5a687e;font-size:12px;line-height:1.5}.preferences input{margin:3px 0 0;accent-color:#2b64c5}
    details{margin-top:16px;border-top:1px solid #dbe3ed;padding-top:12px;color:#5a687e;font-size:12px}summary{cursor:pointer}.steps{padding:0 0 0 20px;margin:12px 0 0}.steps li{padding:0 0 10px 4px;line-height:1.5}.step-url{display:block;overflow-wrap:anywhere;color:#71819a}
    .toast{font-size:12px;color:#23765b;margin:9px 0 0}.launcher{font-family:Bahnschrift,"Segoe UI",sans-serif;padding:11px 15px;background:#e9f0fa;color:#172b4d;border:1px solid #bcc9da;border-radius:8px;cursor:pointer;box-shadow:0 4px 18px #172b4d20}.hidden{display:none!important}
    @media(prefers-reduced-motion:no-preference){.resolving .dot{animation:pulse 1.3s ease-in-out infinite}@keyframes pulse{50%{opacity:.35}}}
  `;
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function prepareEz4Page() {
    let target;
    try { target = Core.ez4Destination(location.href) || Core.oneShortDestination(location.href); } catch { return null; }
    if (!target || !Core.isFileHost(target)) return null;
    window.stop();
    // document-start can stop parsing before an <html> element exists.
    // Build a small local surface so the result remains visible and usable.
    if (!document.documentElement) document.append(document.createElement("html"));
    const html = document.documentElement; html.lang = "vi";
    if (!document.head) html.prepend(document.createElement("head"));
    if (!document.body) html.append(document.createElement("body"));
    document.title = "AdSkip: trang đích đã sẵn sàng";
    const style = element("style", 'body{margin:0;background:#f7fafc;color:#172b4d;font-family:"Segoe UI",sans-serif}main.adskip-ready{margin:56px 24px;max-width:540px}main.adskip-ready h1{font-family:Bahnschrift,"Segoe UI",sans-serif;font-size:28px;font-weight:600;line-height:1.25}main.adskip-ready p{color:#5a687e;line-height:1.6}');
    document.head.append(style);
    const main = element("main", undefined, "adskip-ready");
    main.append(element("h1", "Trang đích đã sẵn sàng"), element("p", "Chọn Mở trang đích trong bảng AdSkip để tiếp tục."));
    document.body.append(main);
    return target;
  }
  function mount(handlers, autoOpen = false) {
    const previous = document.getElementById("adskip-widget");
    if (previous) return null;
    const host = document.createElement("div");
    host.id = "adskip-widget";
    host.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:calc(100vw - 24px)";
    const shadow = host.attachShadow({ mode: "open" });
    const style = element("style", css);
    const panel = element("section", undefined, "panel idle");
    panel.setAttribute("aria-label", "AdSkip: tìm trang đích");
    const header = element("header");
    const brand = element("span", "AdSkip", "brand");
    const collapse = element("button", "Thu gọn", "collapse");
    collapse.type = "button";
    header.append(brand, collapse);
    const body = element("div", undefined, "body");
    const status = element("p", undefined, "status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const dot = element("span", undefined, "dot"); dot.setAttribute("aria-hidden", "true");
    const statusText = element("span", "Sẵn sàng"); status.append(dot, statusText);
    const message = element("p", "Tìm trang đích của link đang mở.", "message");
    const destination = element("a", "", "destination hidden");
    destination.target = "_blank"; destination.rel = "noopener noreferrer";
    const actions = element("div", undefined, "actions");
    const open = element("a", "Mở trang đích", "button primary hidden");
    open.target = "_blank"; open.rel = "noopener noreferrer";
    const copy = element("button", "Sao chép", "button hidden"); copy.type = "button";
    const retry = element("button", "Tìm link", "button"); retry.type = "button";
    const resume = element("button", "Tiếp tục kiểm tra", "button hidden"); resume.type = "button";
    const stop = element("button", "Dừng", "button hidden"); stop.type = "button";
    const guidance = element("p", "Hoàn tất thao tác trên trang đang mở rồi chọn Tiếp tục kiểm tra.", "guidance hidden");
    guidance.style.cssText = "margin-top:12px;font-size:12px;color:#795018;line-height:1.5";
    actions.append(open, copy, resume, retry, stop);
    const preference = element("label", undefined, "preferences");
    const checkbox = element("input"); checkbox.type = "checkbox"; checkbox.checked = autoOpen;
    const preferenceText = element("span", "Mở trang đích khi tìm được");
    preference.append(checkbox, preferenceText);
    const details = element("details"); const summary = element("summary", "Các bước đã xử lý");
    const steps = element("ol", undefined, "steps"); details.append(summary, steps);
    const toast = element("p", "", "toast"); toast.setAttribute("role", "status");
    body.append(status, message, guidance, destination, actions, preference, details, toast);
    panel.append(header, body);
    const launcher = element("button", "AdSkip", "launcher hidden");
    launcher.type = "button"; launcher.setAttribute("aria-label", "Mở bảng AdSkip");
    shadow.append(style, panel, launcher);
    (document.body || document.documentElement).append(host);
    let state = { phase: "idle", steps: [] };
    let toastTimer;
    collapse.addEventListener("click", () => { panel.classList.add("hidden"); launcher.classList.remove("hidden"); launcher.focus(); });
    launcher.addEventListener("click", () => { panel.classList.remove("hidden"); launcher.classList.add("hidden"); collapse.focus(); });
    retry.addEventListener("click", () => handlers.onStart());
    resume.addEventListener("click", () => (handlers.onContinue || handlers.onStart)());
    stop.addEventListener("click", () => handlers.onStop());
    checkbox.addEventListener("change", () => handlers.onPreference(checkbox.checked));
    copy.addEventListener("click", async () => {
      try { await handlers.onCopy(state.url); toast.textContent = "Đã sao chép địa chỉ."; }
      catch { toast.textContent = "Chưa sao chép được. Mở link rồi sao chép từ thanh địa chỉ."; }
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.textContent = ""; }, 3500);
    });
    const labels = { idle: "Sẵn sàng", resolving: "Đang tìm trang đích", resolved: "Đã tìm được trang đích", manual: "Cần thao tác trên trang", error: "Chưa lấy được link", stopped: "Đã dừng" };
    function render(next) {
      state = next;
      const minimized = panel.classList.contains("hidden");
      panel.className = "panel " + (next.phase || "idle") + (minimized ? " hidden" : "");
      statusText.textContent = labels[next.phase] || labels.idle;
      message.textContent = next.message || "Đang đọc dữ liệu trang…";
      let safeUrl = null;
      try { if (next.url && next.phase !== "resolving") safeUrl = Core.urlOf(next.url).href; } catch { /* No unsafe hyperlink. */ }
      destination.classList.toggle("hidden", !safeUrl);
      open.classList.toggle("hidden", !safeUrl);
      copy.classList.toggle("hidden", !safeUrl);
      if (safeUrl) {
        destination.textContent = safeUrl; destination.href = safeUrl; open.href = safeUrl;
        open.textContent = next.phase === "resolved" ? "Mở trang đích" : "Mở bước hiện tại";
      } else { destination.removeAttribute("href"); open.removeAttribute("href"); }
      retry.disabled = next.phase === "resolving";
      retry.textContent = next.phase === "idle" ? "Tìm link" : "Tìm lại";
      const resumable = Core.canContinue(next);
      resume.classList.toggle("hidden", !resumable);
      guidance.classList.toggle("hidden", !resumable);
      retry.classList.toggle("hidden", resumable);
      stop.classList.toggle("hidden", next.phase !== "resolving");
      steps.replaceChildren();
      for (const step of next.steps || []) {
        const item = element("li", step.label);
        item.append(element("span", step.url, "step-url")); steps.append(item);
      }
    }
    return { render, setPreference(value) { checkbox.checked = !!value; }, host, shadow };
  }
  async function pageHints(signal, waitMs = 8000) {
    if (Core.serviceOf(location.href) !== "1short") return {};
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (document.readyState === "loading") await new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => { clearTimeout(timer); document.removeEventListener("DOMContentLoaded", ready); signal?.removeEventListener("abort", abort); };
      const ready = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
      document.addEventListener("DOMContentLoaded", ready, { once: true });
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(ready, waitMs);
      if (signal?.aborted) abort();
    });
    const candidate = () => document.getElementById("redirect-link")?.getAttribute("data-href");
    let result = candidate();
    if (!result && document.getElementById("redirect-link")) {
      result = await new Promise((resolve) => {
        let timer;
        const finish = (value) => { observer.disconnect(); clearTimeout(timer); signal?.removeEventListener("abort", abort); resolve(value); };
        const observer = new MutationObserver(() => { const value = candidate(); if (value) finish(value); });
        const abort = () => finish(null);
        observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["data-href"], childList: true });
        timer = setTimeout(() => finish(null), waitMs);
        if (signal?.aborted) finish(null); else signal?.addEventListener("abort", abort, { once: true });
      });
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return { initialCandidate: result || undefined, initialHtml: document.documentElement?.outerHTML.slice(0, 1048576) };
  }
  root.AdSkipPanel = { mount, pageHints, prepareEz4Page };
})(typeof globalThis !== "undefined" ? globalThis : this);

(async function () {
  "use strict";
  const Core = globalThis.AdSkipCore;
  const Resolver = globalThis.AdSkipResolver;
  const Panel = globalThis.AdSkipPanel;
  if (window.top !== window || !Core.SERVICE_HOSTS.has(location.hostname)) return;
  Panel.prepareEz4Page();
  if (!document.documentElement) await new Promise((resolve) => {
    const observer = new MutationObserver(() => { if (document.documentElement) { observer.disconnect(); resolve(); } });
    observer.observe(document, { childList: true });
  });
  let autoOpen = !!GM_getValue("autoOpen", false);
  let controller;
  let generation = 0;
  let lastResult;
  const request = (url, config = {}) => new Promise((resolve, reject) => {
    if (!Core.canRequest(url, config.method || "GET")) { reject(new Core.AdSkipError("REQUEST_DENIED", "Địa chỉ yêu cầu chưa được hỗ trợ.")); return; }
    if (config.signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const abort = () => { cleanup(); handle.abort(); reject(new DOMException("Aborted", "AbortError")); };
    const cleanup = () => config.signal?.removeEventListener("abort", abort);
    const handle = GM_xmlhttpRequest({
      method: config.method || "GET", url, timeout: 15000, anonymous: false,
      headers: config.method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Accept: "application/json" } : { Accept: "text/html" },
      data: config.fields ? new URLSearchParams(config.fields).toString() : undefined,
      onload(reply) { cleanup(); resolve({ status: reply.status, finalUrl: reply.finalUrl || url, text: reply.responseText || "" }); },
      onerror() { cleanup(); reject(new Core.AdSkipError("NETWORK_ERROR", "Không kết nối được trang trung gian. Kiểm tra quyền kết nối của userscript.")); },
      ontimeout() { cleanup(); reject(new Core.AdSkipError("TIMEOUT", "Trang trung gian phản hồi quá lâu. Thử lại sau.")); },
      onabort() { cleanup(); reject(new DOMException("Aborted", "AbortError")); }
    });
    config.signal?.addEventListener("abort", abort, { once: true });
  });
  const maybeOpen = () => {
    if (autoOpen && lastResult?.phase === "resolved" && Core.isFileHost(lastResult.url) && Core.SERVICE_HOSTS.has(location.hostname) && Core.visitKey(lastResult.sourceUrl) === Core.visitKey(location.href) && Core.visitKey(lastResult.url) !== Core.visitKey(location.href)) location.replace(lastResult.url);
  };
  const panel = Panel.mount({
    onStart: start,
    onContinue: start,
    onStop() { generation++; controller?.abort(); lastResult = null; panel.render({ phase: "stopped", message: "Đã dừng xử lý.", code: "CANCELLED", steps: [] }); },
    onPreference(value) { autoOpen = value; GM_setValue("autoOpen", value); maybeOpen(); },
    onCopy(url) { GM_setClipboard(url, "text"); }
  }, autoOpen);
  if (!panel) return;
  async function start() {
    controller?.abort(); controller = new AbortController();
    const current = ++generation;
    const sourceUrl = location.href;
    lastResult = null;
    panel.render({ phase: "resolving", message: "Đang đọc URL mà trang cung cấp…", steps: [] });
    try {
      const hints = await Panel.pageHints(controller.signal);
      if (generation !== current) return;
      const result = await Resolver.resolve(sourceUrl, {
        ...hints, request, signal: controller.signal,
        onStep(step, steps) { if (generation === current) panel.render({ phase: "resolving", message: step.label + "…", steps }); }
      });
      if (generation !== current || Core.visitKey(sourceUrl) !== Core.visitKey(location.href)) return;
      lastResult = { ...result, sourceUrl }; panel.render(lastResult); maybeOpen();
    } catch { if (generation === current) panel.render({ phase: "error", message: "Không đọc được dữ liệu trang. Tải lại trang rồi thử lại.", steps: [] }); }
  }
  await start();
})();

})();
