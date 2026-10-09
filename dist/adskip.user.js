// ==UserScript==
// @name         AdSkip: 1short & EZ4Short
// @namespace    local.adskip
// @version      1.0.0
// @description  Tìm trang đích 1shortlink/EZ4Short, xử lý nhiều link, lưu lịch sử cục bộ và ẩn khung quảng cáo.
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
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @downloadURL  https://raw.githubusercontent.com/vankhoa-gubit/Skip-short-link/main/dist/adskip.user.js
// @updateURL    https://raw.githubusercontent.com/vankhoa-gubit/Skip-short-link/main/dist/adskip.user.js
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
  const VERSION = "1.0.0";
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
    const service = serviceOf(pageUrl);
    if (!["1short", "ez4short"].includes(service)) return null;
    // Ignore inert markup and JavaScript strings that resemble link controls.
    const markup = html.replace(/<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
    const candidates = new Set();
    for (const tag of markup.matchAll(/<(?:a|button)\b([^>]*)>/gi)) {
      const attributes = Object.create(null);
      for (const attribute of tag[1].matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
        const name = attribute[1].toLowerCase();
        if (!(name in attributes)) attributes[name] = decodeEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? "");
      }
      const classes = (attributes.class || "").split(/\s+/);
      const recognized = service === "1short" ? attributes.id === "redirect-link" :
        ["redirect-link", "get-link", "go-link"].includes(attributes.id) || classes.includes("get-link");
      if (!recognized || "disabled" in attributes || "hidden" in attributes ||
          /^true$/i.test(attributes["aria-disabled"] || "") || /^true$/i.test(attributes["aria-hidden"] || "") ||
          classes.some((name) => ["disabled", "link-disabled"].includes(name)) ||
          /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attributes.style || "")) continue;
      const value = attributes["data-href"] || (service === "ez4short" && attributes.href);
      if (!value || value.startsWith("#")) continue;
      let target;
      try { target = urlOf(value, pageUrl).href; } catch { continue; }
      if (visitKey(target) === visitKey(pageUrl)) continue;
      if (service === "ez4short" && serviceOf(target) === "unknown") continue;
      candidates.add(target);
    }
    if (candidates.size > 1) throw new AdSkipError("AMBIGUOUS_TARGET", "Trang cung cấp nhiều URL đích khác nhau. Mở bước hiện tại để kiểm tra.");
    return candidates.values().next().value || null;
  }
  function ez4Alias(input) {
    const url = urlOf(input);
    if (serviceOf(url) !== "ez4short" || !/^\/[a-z0-9_-]{1,128}\/?$/i.test(url.pathname)) return false;
    const name = url.pathname.split("/")[1].toLowerCase();
    return !["st", "api", "admin", "auth", "login", "logout", "register", "dashboard", "users", "profile", "account", "links", "pages", "tools", "contact", "privacy", "terms"].includes(name);
  }
  function canRequest(input, method = "GET") {
    const url = urlOf(input);
    if (url.port && url.port !== "443") return false;
    if (serviceOf(url) === "ez4short") return method === "GET" && ez4Alias(url.href);
    if (serviceOf(url) !== "1short") return false;
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
  return { VERSION, SERVICE_HOSTS, FILE_HOSTS, AdSkipError, urlOf, hostIs, isFileHost, serviceOf, describeUrl, visitKey, inputUrl, canContinue, oneShortDestination, decodeEntities, ez4Destination, oneShortInit, oneShortReply, buttonCandidate, ez4Alias, canRequest, httpError };
});


(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.AdSkipAdapters = factory(root.AdSkipCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  const manual = (code, message) => ({ phase: "manual", code, message });
  async function pageOf(url, context) {
    const page = context.hints.initialHtml ? { status: 200, finalUrl: url, text: context.hints.initialHtml } : await context.request(url);
    if (page.finalUrl && Core.visitKey(page.finalUrl) !== Core.visitKey(url)) return { next: Core.urlOf(page.finalUrl).href };
    const error = Core.httpError(page); if (error) throw error;
    return { html: page.text || "" };
  }
  const registry = {
    "1short": {
      embedded: Core.oneShortDestination,
      embeddedLabel: "Đọc URL đích từ link full-pages",
      async advance(url, context) {
        if (context.hints.initialCandidate) {
          context.emit("Đọc URL mà trang 1short đã nhận", url);
          return { next: Core.urlOf(context.hints.initialCandidate, url).href };
        }
        if (!Core.canRequest(url)) return manual("UNSUPPORTED_PATH", "Dạng đường dẫn 1short này chưa được hỗ trợ.");
        context.emit(Core.urlOf(url).pathname === "/redirect-link" ? "Theo chuyển hướng 1short" : "Đọc trang 1short", url);
        const page = await pageOf(url, context);
        if (page.next) return page;
        const candidate = Core.buttonCandidate(page.html, url);
        if (candidate) return { next: candidate };
        const init = Core.oneShortInit(page.html, url);
        if (!init) return manual("FORM_NOT_FOUND", "Chưa thấy dữ liệu lấy link. Trang có thể yêu cầu mật khẩu, xác minh hoặc đã thay đổi giao diện.");
        context.emit("Yêu cầu URL kế tiếp từ 1short", url);
        const reply = await context.request(init.endpoint, { method: "POST", fields: init.fields });
        const error = Core.httpError(reply); if (error) throw error;
        return { next: Core.oneShortReply(reply.text, url) };
      }
    },
    ez4short: {
      embedded: Core.ez4Destination,
      embeddedLabel: "Đọc URL đích từ EZ4Short",
      async advance(url, context) {
        if (!Core.ez4Alias(url)) return manual("UNSUPPORTED_PATH", "Dạng đường dẫn EZ4Short này chưa được hỗ trợ. Dùng link dạng mã ngắn hoặc /st có URL đích.");
        if (context.hints.initialCandidate) {
          const next = Core.urlOf(context.hints.initialCandidate, url).href;
          if (Core.serviceOf(next) !== "unknown" && Core.visitKey(next) !== Core.visitKey(url)) {
            context.emit("Đọc URL mà trang EZ4Short đã cung cấp", url);
            return { next };
          }
        }
        context.emit("Đọc link dạng ngắn EZ4Short", url);
        const page = await pageOf(url, context);
        if (page.next) return page;
        const candidate = Core.buttonCandidate(page.html, url);
        if (candidate) return { next: candidate };
        return manual("EZ4_ALIAS", "Trang EZ4Short chưa cung cấp URL đích trên nút lấy link. Hoàn tất thao tác trên trang rồi chọn Tiếp tục kiểm tra.");
      }
    },
    tech8s: {
      async advance(url, context) {
        context.emit("Bài viết trung gian Tech8s", url);
        return manual("ARTICLE_WITHOUT_CONTEXT", "URL bài viết chưa đủ để xác định file. Bắt đầu từ link 1short hoặc EZ4Short gốc.");
      }
    }
  };
  return { forUrl(url) { return registry[Core.serviceOf(url)] || null; } };
});


(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"), require("./adapters.js"));
  else root.AdSkipResolver = factory(root.AdSkipCore, root.AdSkipAdapters);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, Adapters) {
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
        const adapter = Adapters.forUrl(cursor);
        if (!adapter) {
          emit("Gặp dịch vụ chưa hỗ trợ", cursor);
          return finish("manual", "Đã tìm được bước kế tiếp nhưng dịch vụ này chưa được hỗ trợ.", cursor, "UNSUPPORTED_HOST");
        }
        const embedded = adapter.embedded?.(cursor);
        if (embedded) { emit(adapter.embeddedLabel, cursor); cursor = embedded; continue; }
        const result = await adapter.advance(cursor, { request, emit, hints: hop === 0 ? options : {} });
        if (!result.next) return finish(result.phase, result.message, cursor, result.code);
        cursor = Core.urlOf(result.next, cursor).href;
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


(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.AdSkipAds = factory(root.AdSkipCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  const common = ["googlesyndication.com", "doubleclick.net"];
  const services = [
    { id: "1short", label: "1shortlink", hosts: ["1shortlink.com", "www.1shortlink.com"], domains: [...common, "3nbf4.com", "jhnwr.com", "forfrogadiertor.com"] },
    { id: "ez4short", label: "EZ4Short", hosts: ["ez4short.com", "www.ez4short.com"], domains: common },
    { id: "tech8s", label: "Tech8s", hosts: ["tech8s.net", "www.tech8s.net"], domains: common }
  ];
  function normalize(value) { return Object.fromEntries(services.map(({ id }) => [id, typeof value?.[id] === "boolean" ? value[id] : true])); }
  function rules(service) {
    return [{ id: 1, priority: 1, action: { type: "block" }, condition: {
      initiatorDomains: service.hosts, requestDomains: service.domains,
      resourceTypes: ["script", "image", "xmlhttprequest", "sub_frame", "ping", "media", "other"]
    } }];
  }
  function isAdUrl(value, serviceId) {
    const service = services.find(({ id }) => id === serviceId);
    if (!service) return false;
    let url; try { url = new URL(value, "https://" + service.hosts[0] + "/"); } catch { return false; }
    return ["http:", "https:"].includes(url.protocol) && service.domains.some((domain) => Core.hostIs(url.hostname, domain));
  }
  function mount(document, serviceId, enabled = true, onCount = () => {}) {
    if (!services.some(({ id }) => id === serviceId)) return { setEnabled() {}, dispose() {} };
    const marker = "data-adskip-ad-hidden";
    const marked = new Map();
    let active = false; let observer; let style; let scheduled = false;
    const restore = (node) => {
      const previous = marked.get(node);
      if (previous === null) node.removeAttribute(marker); else node.setAttribute(marker, previous);
      marked.delete(node);
    };
    const scan = () => {
      if (!active) return;
      const wanted = new Set([...document.querySelectorAll("iframe[src],img[src],ins.adsbygoogle")].filter((node) =>
        node.matches("ins.adsbygoogle") || isAdUrl(node.getAttribute("src"), serviceId)));
      for (const node of marked.keys()) if (!wanted.has(node)) restore(node);
      for (const node of wanted) if (!marked.has(node)) {
        marked.set(node, node.getAttribute(marker)); node.setAttribute(marker, "true");
      }
      onCount(marked.size);
    };
    const schedule = () => {
      if (scheduled) return; scheduled = true;
      queueMicrotask(() => { scheduled = false; scan(); });
    };
    function setEnabled(value) {
      if (!!value === active) return;
      active = !!value;
      if (active) {
        style = document.createElement("style");
        style.textContent = '[' + marker + '="true"]{display:none!important}';
        (document.head || document.documentElement).append(style);
        observer = new MutationObserver(schedule);
        observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "class"] });
        scan();
      } else {
        observer?.disconnect(); style?.remove();
        for (const node of marked.keys()) restore(node);
        onCount(0);
      }
    }
    setEnabled(enabled);
    return { setEnabled, dispose() { setEnabled(false); } };
  }
  return { services, normalize, rules, isAdUrl, mount };
});


(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.AdSkipLibrary = factory(root.AdSkipCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  const defaults = { autoOpen: false, saveHistory: true, historyLimit: 100, batchDelayMs: 1000 };
  function normalizeSettings(value = {}) {
    return { autoOpen: typeof value.autoOpen === "boolean" ? value.autoOpen : false,
      saveHistory: typeof value.saveHistory === "boolean" ? value.saveHistory : true,
      historyLimit: [25, 100, 250].includes(value.historyLimit) ? value.historyLimit : 100,
      batchDelayMs: [500, 1000, 2000].includes(value.batchDelayMs) ? value.batchDelayMs : 1000 };
  }
  function normalizeHistory(records) {
    if (!Array.isArray(records)) return [];
    return records.flatMap((record) => {
      if (!record || typeof record.id !== "string" || record.id.length > 80 || !Number.isFinite(record.createdAt) ||
          !["resolved", "manual", "error"].includes(record.phase) || typeof record.sourceLabel !== "string") return [];
      let url = null;
      try { if (record.phase === "resolved" && Core.isFileHost(record.url)) url = Core.urlOf(record.url).href; } catch { /* Discard unsafe destinations. */ }
      if (record.phase === "resolved" && !url) return [];
      return [{ id: record.id, createdAt: record.createdAt, sourceLabel: record.sourceLabel.slice(0, 200), phase: record.phase,
        message: typeof record.message === "string" ? record.message.slice(0, 500) : "", code: typeof record.code === "string" ? record.code.slice(0, 64) : null, url }];
    }).sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  }
  function create(storage, historyStore) {
    let queue = Promise.resolve();
    const enqueue = (operation) => { const task = queue.then(operation); queue = task.catch(() => {}); return task; };
    const readSettings = async () => {
      const data = await storage.get({ appSettings: null, autoOpen: false });
      return normalizeSettings({ ...data.appSettings, autoOpen: data.autoOpen });
    };
    const readHistory = async () => normalizeHistory(historyStore ? await historyStore.list() : (await storage.get("history")).history);
    const writeHistory = (history) => storage.set({ history });
    const trim = async (limit) => {
      const current = await readHistory();
      if (historyStore) { for (const record of current.slice(limit)) await historyStore.remove(record.id); }
      else await writeHistory(current.slice(0, limit));
    };
    return {
      getSettings() { return enqueue(readSettings); },
      setSettings(patch) {
        return enqueue(async () => {
          if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => !(key in defaults))) throw new Core.AdSkipError("INVALID_SETTINGS", "Tùy chọn không hợp lệ.");
          const next = { ...await readSettings(), ...patch };
          if (JSON.stringify(next) !== JSON.stringify(normalizeSettings(next))) throw new Core.AdSkipError("INVALID_SETTINGS", "Kiểm tra giới hạn lịch sử và thời gian giữa các link.");
          const { autoOpen, ...appSettings } = next;
          await storage.set({ appSettings, autoOpen });
          await trim(next.historyLimit);
          return next;
        });
      },
      getHistory() { return enqueue(async () => (await readHistory()).slice(0, (await readSettings()).historyLimit)); },
      record(sourceUrl, result) {
        return enqueue(async () => {
          if (!["resolved", "manual", "error"].includes(result?.phase)) return null;
          const settings = await readSettings(); if (!settings.saveHistory) return null;
          // Persist only the redacted source label. Input/ciphertext stays in session state.
          const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
          const [entry] = normalizeHistory([{ id, createdAt: Date.now(), sourceLabel: Core.describeUrl(sourceUrl), phase: result.phase, message: result.message, code: result.code, url: result.url }]);
          if (!entry) return null;
          try {
            if (historyStore) { await historyStore.append(entry); await trim(settings.historyLimit); }
            else await writeHistory(normalizeHistory([entry, ...await readHistory()]).slice(0, settings.historyLimit));
          } catch { throw new Core.AdSkipError("HISTORY_SAVE_FAILED", "Đã xử lý link nhưng chưa lưu được lịch sử. Kiểm tra dung lượng lưu trữ hoặc tắt lưu lịch sử."); }
          return entry;
        });
      },
      removeHistory(id) { return enqueue(async () => { if (historyStore) await historyStore.remove(id); else await writeHistory((await readHistory()).filter((entry) => entry.id !== id)); return readHistory(); }); },
      clearHistory() { return enqueue(async () => { if (historyStore) { for (const entry of await readHistory()) await historyStore.remove(entry.id); } else await writeHistory([]); return []; }); }
    };
  }
  return { defaults, normalizeSettings, normalizeHistory, create };
});


(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.AdSkipBatch = factory(root.AdSkipCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  const idle = () => ({ phase: "idle", entries: [], duplicates: 0, revision: 0, message: "Dán mỗi link trên một dòng để bắt đầu." });
  function parse(text) {
    if (typeof text !== "string" || text.length > 819200) throw new Core.AdSkipError("BATCH_TOO_LARGE", "Danh sách quá dài. Mỗi lượt tối đa 50 dòng.");
    const lines = text.split(/\r?\n/).map((line, index) => ({ value: line.trim(), line: index + 1 })).filter(({ value }) => value);
    if (!lines.length || lines.length > 50) throw new Core.AdSkipError("BATCH_LIMIT", "Nhập từ 1 đến 50 dòng, mỗi dòng một URL HTTPS.");
    const seen = new Set(); const entries = []; let duplicates = 0;
    for (const { value, line } of lines) {
      let sourceUrl;
      try { sourceUrl = Core.inputUrl(value); }
      catch (error) { entries.push({ id: line, sourceLabel: "Dòng " + line + ": link không hợp lệ", phase: "error", code: error.code || "INVALID_URL", message: error.message, url: null }); continue; }
      if (seen.has(sourceUrl)) { duplicates++; continue; } seen.add(sourceUrl);
      entries.push({ id: line, sourceUrl, sourceLabel: Core.describeUrl(sourceUrl), phase: "queued", message: "Đang chờ", code: null, url: null });
    }
    return { entries, duplicates };
  }
  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
      const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    });
  }
  function create(options) {
    let job; let epoch = 0; let writes = Promise.resolve(); let controls = Promise.resolve();
    const enqueue = (operation) => { const task = controls.then(operation); controls = task.catch(() => {}); return task; };
    function publish(state, token) {
      const snapshot = structuredClone(state);
      const task = writes.catch(() => {}).then(async () => {
        if (token !== epoch) return null;
        const previous = (await options.storage.get("batch")).batch;
        snapshot.revision = (previous?.revision || 0) + 1; snapshot.updatedAt = Date.now();
        await options.storage.set({ batch: snapshot }); try { options.onState?.(snapshot); } catch { /* A view must not interrupt a saved queue. */ } return snapshot;
      });
      writes = task; return task;
    }
    async function read() {
      await writes.catch(() => {});
      const stored = (await options.storage.get("batch")).batch;
      return stored && Array.isArray(stored.entries) ? structuredClone(stored) : idle();
    }
    const pending = (entry) => ["queued", "resolving", "stopped"].includes(entry.phase) && !!entry.sourceUrl;
    function stopEntries(state, code) {
      for (const entry of state.entries) if (pending(entry)) Object.assign(entry, { phase: "stopped", url: null, code, message: code === "SESSION_INTERRUPTED" ? "Phiên bị ngắt. Chọn Chạy tiếp để kiểm tra lại." : "Đã dừng. Có thể chạy tiếp." });
      state.phase = "stopped"; state.activeId = null; state.message = code === "SESSION_INTERRUPTED" ? "Phiên xử lý bị ngắt. Kết quả đã xong được giữ lại; chọn Chạy tiếp khi cần." : "Đã dừng hàng đợi.";
    }
    async function current() {
      const state = await read();
      if (state.phase === "running" && !job) { stopEntries(state, "SESSION_INTERRUPTED"); return await publish(state, epoch); }
      return state;
    }
    async function pump(active, state, ids, overrides = {}) {
      try {
        for (let index = 0; index < ids.length; index++) {
          if (job !== active || active.controller.signal.aborted) return;
          if (index) await (options.wait || wait)((await options.getSettings()).batchDelayMs, active.controller.signal);
          if (job !== active) return;
          const entry = state.entries.find(({ id }) => id === ids[index]);
          state.activeId = entry.id; Object.assign(entry, { phase: "resolving", message: "Đang tìm trang đích…", url: null, code: null });
          await publish(state, active.token);
          if (job !== active || active.controller.signal.aborted) return;
          const result = await options.resolve({ ...entry, ...overrides[entry.id] }, {
            signal: active.controller.signal,
            onStep(step) { if (job === active) { entry.message = step.label + "…"; void publish(state, active.token).catch(() => {}); } }
          });
          if (job !== active || active.controller.signal.aborted) return;
          Object.assign(entry, { phase: result.phase, message: result.message, code: result.code, url: result.url || null });
          await publish(state, active.token);
          if (job !== active) return;
          if (options.onResult) {
            try { await options.onResult(entry.sourceUrl, result); }
            catch (error) { state.historyWarning = error.code === "HISTORY_SAVE_FAILED" ? error.message : "Chưa lưu được lịch sử của link vừa xử lý."; }
          }
          if (job !== active) return;
          if (result.code === "RATE_LIMITED") { state.phase = "paused"; state.activeId = null; state.message = "Dịch vụ giới hạn lượt truy cập. Hàng đợi tạm dừng; chờ một lúc rồi Chạy tiếp."; await publish(state, active.token); return; }
        }
        if (job === active) {
          state.phase = state.entries.some((entry) => pending(entry)) ? "paused" : "complete";
          state.activeId = null; state.message = state.phase === "complete" ? "Đã xử lý xong danh sách." : "Link đã được kiểm tra lại. Chọn Chạy tiếp cho các link còn chờ.";
          await publish(state, active.token);
        }
      } catch (error) {
        if (job === active) { stopEntries(state, "BATCH_INTERRUPTED"); state.message = "Hàng đợi bị ngắt. Kết quả đã xong được giữ; chọn Chạy tiếp để thử lại."; await publish(state, active.token).catch(() => {}); }
      } finally { if (job === active) job = null; }
    }
    async function launch(state, ids, overrides) {
      if (job) throw new Core.AdSkipError("BATCH_RUNNING", "Hàng đợi đang chạy. Dừng trước khi bắt đầu lượt khác.");
      const active = { token: ++epoch, controller: new AbortController(), state }; job = active;
      state.phase = "running"; state.activeId = null; state.message = "Đang xử lý lần lượt; hàng đợi không tự mở trang đích."; delete state.historyWarning;
      try { const initial = await publish(state, active.token); void pump(active, state, ids, overrides); return initial; }
      catch (error) { job = null; throw error; }
    }
    return {
      get() { return enqueue(current); },
      start(text) { return enqueue(async () => { const previous = await current(); const parsed = parse(text); return launch({ ...parsed, createdAt: Date.now(), revision: previous.revision }, parsed.entries.filter(({ phase }) => phase === "queued").map(({ id }) => id)); }); },
      resume() { return enqueue(async () => { const state = await current(); return launch(state, state.entries.filter(pending).map(({ id }) => id)); }); },
      retry(id, override) { return enqueue(async () => { const state = await current(); const entry = state.entries.find((item) => item.id === id); if (!entry?.sourceUrl) throw new Core.AdSkipError("INVALID_ENTRY", "Link này không thể chạy lại."); if (override?.startUrl) Core.inputUrl(override.startUrl); return launch(state, [id], override ? { [id]: override } : {}); }); },
      stop() { return enqueue(async () => { epoch++; job?.controller.abort(); job = null; const state = await read(); stopEntries(state, "CANCELLED"); return publish(state, epoch); }); },
      attachTab(id, tabId) { return enqueue(async () => { const state = job?.state || await current(); const entry = state.entries.find((item) => item.id === id); if (!entry) throw new Core.AdSkipError("INVALID_ENTRY", "Không tìm thấy link trong danh sách."); entry.manualTabId = tabId; return publish(state, epoch); }); }
    };
  }
  return { create, parse, idle, wait };
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
  function mount(handlers, autoOpen = false, adFilter) {
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
    const adPreference = element("label", undefined, "preferences");
    const adCheckbox = element("input"); adCheckbox.type = "checkbox"; adCheckbox.checked = !!adFilter?.enabled;
    adPreference.append(adCheckbox, element("span", adFilter?.label || "Lọc quảng cáo"));
    const adHelp = element("p", adFilter?.help || "", "ad-help");
    adHelp.style.cssText = "font-size:11px;line-height:1.5;color:#5a687e;margin:5px 0 0";
    if (!adFilter) { adPreference.classList.add("hidden"); adHelp.classList.add("hidden"); }
    const details = element("details"); const summary = element("summary", "Các bước đã xử lý");
    const steps = element("ol", undefined, "steps"); details.append(summary, steps);
    const toast = element("p", "", "toast"); toast.setAttribute("role", "status");
    body.append(status, message, guidance, destination, actions, preference, adPreference, adHelp, details, toast);
    if (handlers.onManager) {
      const manage = element("button", "Quản lý link", "button"); manage.type = "button"; manage.style.cssText = "margin-top:12px;font-size:12px";
      manage.addEventListener("click", () => { Promise.resolve(handlers.onManager()).catch(() => { toast.textContent = "Chưa mở được trang quản lý. Thử lại."; }); });
      body.append(manage);
    }
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
    adCheckbox.addEventListener("change", async () => {
      const requested = adCheckbox.checked; adCheckbox.disabled = true;
      try {
        const reply = await handlers.onAdFilter(requested);
        if (reply?.error) throw new Error(reply.error);
      } catch (error) { adCheckbox.checked = !requested; toast.textContent = error.message || "Chưa lưu được tùy chọn quảng cáo."; }
      finally { adCheckbox.disabled = false; }
    });
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
      if (next.historyWarning) toast.textContent = next.historyWarning;
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
    return { render, setPreference(value) { checkbox.checked = !!value; }, setAdFilter(value) { adCheckbox.checked = !!value; }, host, shadow };
  }
  async function pageHints(signal, waitMs = 8000) {
    const service = Core.serviceOf(location.href);
    if (!["1short", "ez4short"].includes(service)) return {};
    if (Core.oneShortDestination(location.href) || Core.ez4Destination(location.href)) return {};
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
    const selector = service === "1short" ? "#redirect-link" : "a#redirect-link,button#redirect-link,a#get-link,button#get-link,a#go-link,button#go-link,a.get-link,button.get-link";
    const candidate = () => {
      try { return Core.buttonCandidate([...document.querySelectorAll(selector)].map((node) => node.outerHTML).join("\n"), location.href); }
      catch { return null; }
    };
    let result = candidate();
    if (!result && document.querySelector(selector)) {
      result = await new Promise((resolve) => {
        let timer;
        const finish = (value) => { observer.disconnect(); clearTimeout(timer); signal?.removeEventListener("abort", abort); resolve(value); };
        const observer = new MutationObserver(() => { const value = candidate(); if (value) finish(value); });
        const abort = () => finish(null);
        observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["data-href", "href", "class", "disabled", "aria-disabled", "hidden", "style"], childList: true });
        timer = setTimeout(() => finish(null), waitMs);
        if (signal?.aborted) finish(null); else signal?.addEventListener("abort", abort, { once: true });
      });
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return { initialCandidate: result || undefined, initialHtml: document.documentElement?.outerHTML.slice(0, 1048576) };
  }
  root.AdSkipPanel = { mount, pageHints, prepareEz4Page };
})(typeof globalThis !== "undefined" ? globalThis : this);


(function (root) {
  "use strict";
  const Core = root.AdSkipCore; const Ads = root.AdSkipAds;
  const css = `
    :host{display:block;font:14px/1.5 "Segoe UI",Tahoma,sans-serif;color:#172b4d;color-scheme:light;background:#f7fafc}*{box-sizing:border-box}
    .workspace{max-width:1120px;margin:auto;padding:28px 32px 40px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}.brand{display:flex;align-items:baseline;gap:12px}h1{font:600 30px/1.1 Bahnschrift,"Segoe UI",sans-serif;margin:0;letter-spacing:-.6px}.version,.muted,.help{color:#5a687e;font-size:12px}.intro{margin:8px 0 0;color:#5a687e}.close{margin-left:auto}
    nav{display:flex;gap:24px;border-bottom:1px solid #c7d3e2;margin-bottom:26px}nav button{border:0;border-bottom:3px solid transparent;border-radius:0;background:transparent;padding:10px 1px 12px;color:#5a687e;font-size:15px}nav button[aria-selected="true"]{border-color:#2b64c5;color:#172b4d;font-weight:600}
    button,input,textarea,select{font:inherit}button,a{touch-action:manipulation}button{cursor:pointer;min-height:38px;padding:8px 12px;background:#fff;color:#172b4d;border:1px solid #bcc9da;border-radius:6px}button:disabled{opacity:.55;cursor:default}.primary{background:#2b64c5;border-color:#2b64c5;color:#fff}:focus-visible{outline:3px solid #86ade8;outline-offset:3px}button:hover:not(:disabled){filter:brightness(.96)}input,textarea,select{border:1px solid #bcc9da;border-radius:6px;background:#fff;color:#172b4d;padding:9px;max-width:100%}input[type=checkbox]{accent-color:#2b64c5;padding:0;margin:4px 9px 0 0;width:16px;height:16px;flex:none}textarea{width:100%;min-height:230px;resize:vertical;line-height:1.55;font-size:13px}label{display:block;font-weight:600}.help{line-height:1.55;margin:7px 0 14px}.input-label{margin-bottom:8px}h2{font:600 21px/1.35 Bahnschrift,"Segoe UI",sans-serif;margin:0 0 7px}h3{font-size:15px;margin:0 0 9px}
    .batch-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:32px}.controls,.row-actions,.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.controls{margin-top:12px}.toolbar{justify-content:space-between;margin:0 0 16px}.tools{display:flex;gap:8px;flex-wrap:wrap}.progress{font-weight:600;margin:0 0 4px}.queue-message{margin:0 0 12px;color:#5a687e;font-size:13px}.empty{padding:32px 20px;border:1px dashed #bcc9da;color:#5a687e;background:#fff;border-radius:6px;line-height:1.7}.list{display:grid;gap:0}.row{padding:16px 0;border-bottom:1px solid #dbe3ed;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px}.row:first-child{border-top:1px solid #dbe3ed}.source{font-size:13px;font-weight:600;margin:0;overflow-wrap:anywhere}.outcome{display:inline-block;font-size:12px;color:#795018;margin-left:8px;font-weight:400}.resolved .outcome{color:#23765b}.resolving .outcome{color:#2b64c5}.destination{display:block;margin:6px 0 0;overflow-wrap:anywhere;color:#2b64c5;font-size:12px}.row-message{font-size:12px;color:#5a687e;margin:5px 0 0;overflow-wrap:anywhere}.row-actions{align-self:center}.row-actions button{font-size:12px;padding:6px 9px;min-height:34px}.time{display:block;font-size:11px;color:#71819a;margin-top:3px}
    .history-filters{display:flex;gap:10px;flex-wrap:wrap;margin:17px 0}.history-filters input{width:340px}.count{color:#5a687e;font-size:12px}.settings{max-width:640px}.setting-block{padding:22px 0;border-top:1px solid #dbe3ed}.setting-block:first-of-type{border-top:0;padding-top:8px}.check{display:flex;align-items:flex-start;font-weight:400;margin:12px 0 0}.select-setting{display:flex;align-items:center;justify-content:space-between;gap:20px;font-weight:400;margin-top:14px}.select-setting select{min-width:130px}.notice{font-size:13px;color:#23765b;overflow-wrap:anywhere;min-height:1.5em;margin:14px 0 0}.notice.error{color:#9a3d27}.footnote{font-size:12px;color:#5a687e;margin:32px 0 0}a{color:#2b64c5}[hidden]{display:none!important}
    @media(max-width:800px){.workspace{padding:22px 20px 28px}.batch-layout{grid-template-columns:1fr;gap:24px}textarea{min-height:145px}.row{grid-template-columns:1fr}.row-actions{align-self:start}nav{gap:20px}.select-setting{flex-wrap:wrap;gap:8px}.toolbar{align-items:flex-start}}
    @media(max-width:380px){.workspace{padding:18px 14px}nav{gap:16px}nav button{font-size:14px}.brand{gap:8px}h1{font-size:26px}.tools button{font-size:12px}}
  `;
  const html = `
    <div class="workspace">
      <header><div><div class="brand"><h1>AdSkip</h1><span id="version" class="version"></span></div><p class="intro">Xử lý link, giữ kết quả và tiếp tục khi cần.</p></div><button id="close" class="close" type="button" hidden>Đóng</button></header>
      <nav role="tablist" aria-label="Quản lý AdSkip">
        <button id="tab-batch" role="tab" type="button" aria-controls="page-batch" aria-selected="true" data-section="batch">Nhiều link</button>
        <button id="tab-history" role="tab" type="button" aria-controls="page-history" aria-selected="false" data-section="history" tabindex="-1">Lịch sử</button>
        <button id="tab-settings" role="tab" type="button" aria-controls="page-settings" aria-selected="false" data-section="settings" tabindex="-1">Cài đặt</button>
      </nav>
      <section id="page-batch" role="tabpanel" aria-labelledby="tab-batch">
        <div class="batch-layout">
          <form id="batch-form"><label for="batch-input" class="input-label">Danh sách link</label><textarea id="batch-input" maxlength="819200" spellcheck="false" placeholder="https://1shortlink.com/…&#10;https://ez4short.com/…" aria-describedby="batch-help"></textarea><p class="help" id="batch-help">Mỗi dòng một URL HTTPS, tối đa 50 dòng. Link trùng được bỏ qua. Kết quả không tự mở thành tab.</p><div class="controls"><button id="batch-start" class="primary" type="submit">Bắt đầu xử lý</button><button id="batch-stop" type="button" hidden>Dừng hàng đợi</button><button id="batch-resume" type="button" hidden>Chạy tiếp</button></div><p id="queue-scope" class="help"></p></form>
          <div><div class="toolbar"><h2>Kết quả</h2><div class="tools"><button id="batch-copy" type="button" disabled>Sao chép các đích</button><button id="batch-export" type="button" disabled>Xuất JSON</button></div></div><p id="batch-progress" class="progress" role="status" aria-live="polite"></p><p id="batch-message" class="queue-message"></p><div id="batch-list" class="list"></div></div>
        </div>
      </section>
      <section id="page-history" role="tabpanel" aria-labelledby="tab-history" hidden>
        <div class="toolbar"><div><h2>Lịch sử trên máy</h2><p class="help">Lưu nhãn nguồn đã che dữ liệu và URL đích đầy đủ. URL đích có thể chứa chữ ký truy cập hoặc đã hết hạn.</p></div><div class="tools"><button id="history-refresh" type="button">Làm mới</button><button id="history-export" type="button">Xuất lịch sử</button><button id="history-clear" type="button">Xóa toàn bộ lịch sử</button></div></div>
        <div class="history-filters"><input id="history-search" type="search" aria-label="Tìm trong lịch sử" placeholder="Tìm dịch vụ hoặc trang đích"><select id="history-phase" aria-label="Lọc trạng thái"><option value="all">Mọi trạng thái</option><option value="resolved">Đã tìm được đích</option><option value="manual">Cần thao tác</option><option value="error">Có lỗi</option></select></div><p id="history-count" class="count" role="status"></p><div id="history-list" class="list"></div>
      </section>
      <section id="page-settings" role="tabpanel" aria-labelledby="tab-settings" hidden>
        <div class="settings"><h2>Cài đặt AdSkip</h2><form id="settings-form">
          <div class="setting-block"><h3>Xử lý link</h3><label class="check"><input id="setting-auto-open" type="checkbox">Tự mở trang đích khi xử lý từng tab</label><p class="help">Hàng đợi nhiều link và link dán trong popup vẫn dùng nút mở.</p><label class="select-setting" for="setting-delay">Khoảng chờ giữa các link<select id="setting-delay"><option value="500">0,5 giây</option><option value="1000">1 giây</option><option value="2000">2 giây</option></select></label></div>
          <div class="setting-block"><h3>Lịch sử</h3><label class="check"><input id="setting-history" type="checkbox">Lưu lịch sử cục bộ</label><p class="help">Tắt để ngừng ghi kết quả mới; lịch sử đang có được giữ tới khi bạn xóa. Link gốc có query hoặc dữ liệu mã hóa không được lưu trong lịch sử.</p><label class="select-setting" for="setting-limit">Số kết quả giữ lại<select id="setting-limit"><option value="25">25 kết quả</option><option value="100">100 kết quả</option><option value="250">250 kết quả</option></select></label><p class="help">Giảm giới hạn sẽ loại những kết quả cũ vượt giới hạn.</p></div>
          <button id="settings-save" class="primary" type="submit">Lưu cài đặt</button>
        </form><div class="setting-block"><h3 id="ads-title">Quảng cáo theo dịch vụ</h3><p id="ads-help" class="help"></p><div id="ad-settings"></div></div><div class="setting-block"><h3>Cài và cập nhật</h3><p class="help">Extension: thay thư mục bản mới, Reload trong trang quản lý tiện ích và tải lại tab. Tampermonkey: cập nhật script đang có, tránh bật hai bản AdSkip cùng lúc.</p><a href="https://github.com/vankhoa-gubit/Skip-short-link/blob/main/HUONG_DAN_CAI_DAT.md" target="_blank" rel="noopener noreferrer">Hướng dẫn cài đặt</a></div></div>
      </section>
      <p id="notice" class="notice" role="status" aria-live="polite"></p><p class="footnote">AdSkip tìm URL đích; kết quả chưa xác nhận file tải được.</p>
    </div>`;
  function mount(parent, api, options = {}) {
    const host = document.createElement("div"); host.id = "adskip-manager";
    const shadow = host.attachShadow({ mode: "open" }); const style = document.createElement("style"); style.textContent = css;
    const content = document.createElement("div"); content.innerHTML = html; shadow.append(style, content); parent.append(host);
    const node = (id) => shadow.getElementById(id);
    node("version").textContent = Core.VERSION;
    node("queue-scope").textContent = options.userscript ? "Hàng đợi thuộc tab này. Đóng hoặc tải lại tab sẽ dừng hàng đợi; kết quả đã lưu vẫn còn trong Lịch sử." : "Có thể đóng trang quản lý và mở lại. Nếu phiên xử lý bị ngắt, chọn Chạy tiếp để kiểm tra các link chưa xong.";
    node("ads-help").textContent = options.userscript ? "Chỉ ẩn khung quảng cáo đã nhận diện; kết nối mạng vẫn có thể xảy ra. Tùy chọn được lưu riêng cho từng dịch vụ." : "Chặn request và ẩn khung quảng cáo đã nhận diện trên từng dịch vụ. Tải lại trang để nạp lại nội dung đã bị chặn trước khi tắt bộ lọc.";
    let section = "batch"; let batch = { revision: -1, entries: [], phase: "idle" }; let history = []; let dirty = false; let disposed = false; let historyGeneration = 0;
    const announce = (message, error = false) => { node("notice").textContent = message; node("notice").classList.toggle("error", error); };
    const action = async (operation) => { try { return await operation(); } catch (error) { announce(error.message || "Thao tác chưa hoàn tất. Thử lại.", true); return null; } };
    const labels = { queued: "Đang chờ", resolving: "Đang xử lý", resolved: "Đã có đích", manual: "Cần thao tác", error: "Có lỗi", stopped: "Đã dừng" };
    function element(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
    function button(label, callback, disabled = false) { const el = element("button", label); el.type = "button"; el.disabled = disabled; el.addEventListener("click", () => action(async () => { el.disabled = true; try { await callback(); } finally { if (el.isConnected) el.disabled = disabled; } })); return el; }
    function row(entry, historyRow = false) {
      const container = element("article", undefined, "row " + entry.phase); container.dataset.entryId = entry.id;
      const details = element("div"); const source = element("p", entry.sourceLabel, "source"); source.append(element("span", labels[entry.phase] || entry.phase, "outcome")); details.append(source);
      if (historyRow) details.append(element("time", new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(entry.createdAt), "time"));
      if (entry.url) { let text; try { text = Core.describeUrl(entry.url); } catch { text = ""; } if (text) details.append(element("span", text, "destination")); }
      if (entry.message) details.append(element("p", entry.message, "row-message"));
      const actions = element("div", undefined, "row-actions"); const busy = batch.phase === "running";
      if (entry.phase === "resolved") {
        actions.append(button("Mở đích", () => historyRow ? api.openHistory(entry.id) : api.openBatch(entry.id)), button("Sao chép", async () => { await api.copy(Core.urlOf(entry.url).href); announce("Đã sao chép URL đầy đủ."); }));
      } else if (!historyRow && entry.phase === "manual" && entry.url) {
        actions.append(button("Mở bước", () => api.openBatch(entry.id)));
        if (api.continueBatch && Core.canContinue(entry)) actions.append(button("Tiếp tục", async () => renderBatch(await api.continueBatch(entry.id)), busy));
      }
      if (historyRow) actions.append(button("Xóa", async () => { history = await api.removeHistory(entry.id); renderHistory(); }));
      else if (entry.sourceUrl && entry.phase !== "resolving") actions.append(button("Tìm lại", async () => renderBatch(await api.retryBatch(entry.id)), busy));
      container.append(details, actions); return container;
    }
    function renderBatch(next) {
      if (!next || disposed || (next.revision || 0) < (batch.revision || 0)) return;
      batch = next; const busy = next.phase === "running";
      const completed = next.entries.filter(({ phase }) => ["resolved", "manual", "error"].includes(phase)).length;
      node("batch-progress").textContent = next.entries.length ? completed + "/" + next.entries.length + " link đã xử lý" + (next.duplicates ? "; bỏ " + next.duplicates + " link trùng" : "") : "Chưa có hàng đợi";
      node("batch-message").textContent = next.message || "";
      node("batch-start").disabled = busy; node("batch-stop").hidden = !busy;
      node("batch-resume").hidden = !["paused", "stopped"].includes(next.phase) || !next.entries.some((entry) => ["queued", "stopped"].includes(entry.phase) && entry.sourceUrl);
      node("batch-copy").disabled = !next.entries.some(({ phase }) => phase === "resolved"); node("batch-export").disabled = !next.entries.length;
      node("batch-list").replaceChildren(...(next.entries.length ? next.entries.map((entry) => row(entry)) : [element("p", "Dán các link cần kiểm tra, rồi Bắt đầu xử lý. Kết quả từng link sẽ hiện ở đây.", "empty")]));
      if (next.historyWarning) announce(next.historyWarning, true);
    }
    function filteredHistory() {
      const query = node("history-search").value.toLowerCase().trim(); const phase = node("history-phase").value;
      return history.filter((entry) => (phase === "all" || entry.phase === phase) && (!query || (entry.sourceLabel + " " + (entry.url || "")).toLowerCase().includes(query)));
    }
    function renderHistory() {
      if (disposed) return; const visible = filteredHistory();
      node("history-count").textContent = visible.length + "/" + history.length + " kết quả";
      node("history-clear").disabled = !history.length; node("history-export").disabled = !visible.length;
      node("history-list").replaceChildren(...(visible.length ? visible.map((entry) => row(entry, true)) : [element("p", history.length ? "Không có kết quả khớp bộ lọc." : "Chưa có lịch sử. Kết quả sẽ được lưu sau khi xử lý link nếu bật Lưu lịch sử cục bộ.", "empty")]));
    }
    async function refreshHistory() { const current = ++historyGeneration; const records = await api.getHistory(); if (current === historyGeneration && !disposed) { history = records; renderHistory(); } }
    function renderSettings(snapshot) {
      if (!snapshot || disposed) return; const settings = snapshot.settings;
      if (!dirty && settings) { node("setting-auto-open").checked = settings.autoOpen; node("setting-history").checked = settings.saveHistory; node("setting-limit").value = String(settings.historyLimit); node("setting-delay").value = String(settings.batchDelayMs); }
      for (const checkbox of shadow.querySelectorAll("[data-ad-service]")) checkbox.checked = Ads.normalize(snapshot.adFilters)[checkbox.dataset.adService];
      if (snapshot.adFilterError) announce(snapshot.adFilterError, true);
    }
    async function show(next) {
      section = ["batch", "history", "settings"].includes(next) ? next : "batch";
      for (const name of ["batch", "history", "settings"]) { node("page-" + name).hidden = name !== section; node("tab-" + name).setAttribute("aria-selected", String(name === section)); node("tab-" + name).tabIndex = name === section ? 0 : -1; }
      if (section === "history") await action(refreshHistory);
      if (section === "settings") await action(async () => renderSettings(await api.snapshot()));
    }
    for (const tab of shadow.querySelectorAll("[data-section]")) {
      tab.addEventListener("click", () => show(tab.dataset.section));
      tab.addEventListener("keydown", (event) => { const names = ["batch", "history", "settings"]; let index = names.indexOf(section); if (event.key === "ArrowRight") index = (index + 1) % 3; else if (event.key === "ArrowLeft") index = (index + 2) % 3; else if (event.key === "Home") index = 0; else if (event.key === "End") index = 2; else return; event.preventDefault(); node("tab-" + names[index]).focus(); void show(names[index]); });
    }
    for (const service of Ads.services) {
      const label = element("label", undefined, "check"); const checkbox = element("input"); checkbox.type = "checkbox"; checkbox.dataset.adService = service.id; label.append(checkbox, document.createTextNode(service.label));
      checkbox.addEventListener("change", () => action(async () => { const requested = checkbox.checked; checkbox.disabled = true; try { await api.setAdFilter(service.id, requested); announce("Đã lưu tùy chọn quảng cáo."); } catch (error) { checkbox.checked = !requested; throw error; } finally { checkbox.disabled = false; } })); node("ad-settings").append(label);
    }
    node("batch-form").addEventListener("submit", (event) => { event.preventDefault(); void action(async () => { announce(""); renderBatch(await api.startBatch(node("batch-input").value)); }); });
    node("batch-stop").addEventListener("click", () => action(async () => renderBatch(await api.stopBatch())));
    node("batch-resume").addEventListener("click", () => action(async () => renderBatch(await api.resumeBatch())));
    node("batch-copy").addEventListener("click", () => action(async () => { await api.copy(batch.entries.filter(({ phase }) => phase === "resolved").map(({ url }) => Core.urlOf(url).href).join("\n")); announce("Đã sao chép các URL đích đầy đủ."); }));
    function exportJson(entries, kind) {
      const records = entries.map(({ sourceLabel, phase, message, code, url, createdAt }) => ({ sourceLabel, phase, message, code, url: phase === "resolved" ? url : null, createdAt }));
      const blob = new Blob([JSON.stringify({ version: Core.VERSION, exportedAt: new Date().toISOString(), results: records }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const anchor = element("a"); anchor.href = url; anchor.download = "AdSkip-" + kind + ".json"; shadow.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); announce("Đã xuất kết quả; file không chứa link gốc đầy đủ.");
    }
    node("batch-export").addEventListener("click", () => action(async () => exportJson(batch.entries, "results")));
    node("history-export").addEventListener("click", () => action(async () => exportJson(filteredHistory(), "history")));
    node("history-refresh").addEventListener("click", () => action(refreshHistory));
    node("history-clear").addEventListener("click", () => action(async () => { history = await api.clearHistory(); renderHistory(); announce("Đã xóa toàn bộ lịch sử."); }));
    node("history-search").addEventListener("input", renderHistory); node("history-phase").addEventListener("change", renderHistory);
    node("settings-form").addEventListener("input", () => { dirty = true; });
    node("settings-form").addEventListener("submit", (event) => { event.preventDefault(); announce(""); void action(async () => { const save = node("settings-save"); save.disabled = true; try { await api.saveSettings({ autoOpen: node("setting-auto-open").checked, saveHistory: node("setting-history").checked, historyLimit: Number(node("setting-limit").value), batchDelayMs: Number(node("setting-delay").value) }); dirty = false; renderSettings(await api.snapshot()); announce("Đã lưu cài đặt."); } finally { save.disabled = false; } }); });
    if (options.onClose) { node("close").hidden = false; node("close").addEventListener("click", options.onClose); }
    const unsubscribe = api.subscribe?.((change) => {
      if (change.batch) renderBatch(change.batch);
      if (change.history && section === "history") void action(refreshHistory);
      if (change.settings && section === "settings") void action(async () => renderSettings(await api.snapshot()));
      if (change.section) void show(change.section);
    });
    const ready = action(async () => { const snapshot = await api.snapshot(); renderBatch(snapshot.batch); history = snapshot.history || []; renderHistory(); renderSettings(snapshot); await show(options.section || "batch"); });
    return { host, shadow, ready, show, dispose() { disposed = true; unsubscribe?.(); host.remove(); } };
  }
  root.AdSkipWorkspace = { mount };
})(typeof globalThis !== "undefined" ? globalThis : this);

(async function () {
  "use strict";
  const Core = globalThis.AdSkipCore;
  const Resolver = globalThis.AdSkipResolver;
  const Panel = globalThis.AdSkipPanel;
  const Ads = globalThis.AdSkipAds;
  const Library = globalThis.AdSkipLibrary;
  const Batch = globalThis.AdSkipBatch;
  const Workspace = globalThis.AdSkipWorkspace;
  if (window.top !== window || !Core.SERVICE_HOSTS.has(location.hostname)) return;
  Panel.prepareEz4Page();
  if (!document.documentElement) await new Promise((resolve) => {
    const observer = new MutationObserver(() => { if (document.documentElement) { observer.disconnect(); resolve(); } });
    observer.observe(document, { childList: true });
  });
  const listeners = new Set();
  const emit = (change) => { for (const listener of listeners) { try { listener(change); } catch { /* A view must not interrupt the queue. */ } } };
  const keyOf = (key) => key === "autoOpen" ? key : "adskip:" + key;
  const storage = {
    async get(keys) {
      const defaults = typeof keys === "string" ? { [keys]: undefined } : keys;
      return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, GM_getValue(keyOf(key), fallback)]));
    },
    async set(values) { for (const [key, value] of Object.entries(values)) await GM_setValue(keyOf(key), value); emit({ settings: true }); }
  };
  const historyPrefix = "adskip:history:";
  async function changedHistory() {
    emit({ history: true });
    await GM_setValue("adskip:historyRevision", crypto.randomUUID());
  }
  // One GM key per result prevents two tabs from replacing each other's history.
  const historyStore = {
    async list() { return GM_listValues().filter((key) => key.startsWith(historyPrefix)).map((key) => GM_getValue(key, null)); },
    async append(entry) { await GM_setValue(historyPrefix + entry.id, entry); await changedHistory(); },
    async remove(id) { await GM_deleteValue(historyPrefix + id); await changedHistory(); }
  };
  const library = Library.create(storage, historyStore);
  let autoOpen = (await library.getSettings()).autoOpen;
  const service = Core.serviceOf(location.href);
  const label = Ads.services.find(({ id }) => id === service).label;
  const ads = Ads.mount(document, service, Ads.normalize(GM_getValue("adFilters", null))[service]);
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
  let memory = {};
  const batch = Batch.create({
    storage: { async get(key) { return { [key]: structuredClone(memory[key]) }; }, async set(value) { memory = { ...memory, ...structuredClone(value) }; } },
    getSettings: () => library.getSettings(),
    onResult: (url, result) => library.record(url, result),
    onState: (state) => emit({ batch: state }),
    async resolve(entry, config) {
      const hints = Core.visitKey(entry.sourceUrl) === Core.visitKey(location.href) ? await Panel.pageHints(config.signal) : {};
      return Resolver.resolve(entry.sourceUrl, { ...config, ...hints, request });
    }
  });
  const openUrl = (url) => GM_openInTab(Core.inputUrl(url), { active: true, insert: true, setParent: true });
  let dialog; let manager;
  async function openManager() {
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.id = "adskip-dialog"; dialog.setAttribute("aria-label", "Quản lý AdSkip");
      dialog.style.cssText = "width:1120px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);padding:0;border:1px solid #bcc9da;border-radius:10px;background:#f7fafc;color:#172b4d;box-shadow:0 16px 60px #172b4d40;";
      (document.body || document.documentElement).append(dialog);
      const api = {
        async snapshot() { return { batch: await batch.get(), history: await library.getHistory(), settings: await library.getSettings(), adFilters: Ads.normalize(GM_getValue("adFilters", null)) }; },
        getHistory: () => library.getHistory(), removeHistory: (id) => library.removeHistory(id), clearHistory: () => library.clearHistory(),
        async openHistory(id) { const entry = (await library.getHistory()).find((record) => record.id === id); if (!entry?.url || !Core.isFileHost(entry.url)) throw new Error("Kết quả này không còn URL đích để mở."); openUrl(entry.url); },
        startBatch: (text) => batch.start(text), stopBatch: () => batch.stop(), resumeBatch: () => batch.resume(), retryBatch: (id) => batch.retry(id),
        async openBatch(id) { const entry = (await batch.get()).entries.find((record) => record.id === id); if (!entry?.url || !["resolved", "manual"].includes(entry.phase)) throw new Error("Chưa có URL để mở cho link này."); openUrl(entry.url); },
        async saveSettings(settings) { const next = await library.setSettings(settings); autoOpen = next.autoOpen; panel.setPreference(autoOpen); return { settings: next }; },
        setAdFilter,
        copy: (text) => GM_setClipboard(text, "text"),
        subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); }
      };
      manager = Workspace.mount(dialog, api, { userscript: true, onClose: () => dialog.close() });
    }
    if (!dialog.open) dialog.showModal();
    await manager.ready;
  }
  const maybeOpen = () => {
    if (autoOpen && lastResult?.phase === "resolved" && Core.isFileHost(lastResult.url) && Core.SERVICE_HOSTS.has(location.hostname) && Core.visitKey(lastResult.sourceUrl) === Core.visitKey(location.href) && Core.visitKey(lastResult.url) !== Core.visitKey(location.href)) location.replace(lastResult.url);
  };
  const panel = Panel.mount({
    onStart: start,
    onContinue: start,
    onManager: openManager,
    onStop() { generation++; controller?.abort(); lastResult = null; panel.render({ phase: "stopped", message: "Đã dừng xử lý.", code: "CANCELLED", steps: [] }); },
    async onPreference(value) {
      try { await library.setSettings({ autoOpen: value }); autoOpen = value; maybeOpen(); }
      catch { panel.setPreference(autoOpen); panel.render({ ...lastResult, historyWarning: "Chưa lưu được tùy chọn. Thử lại." }); }
    },
    onAdFilter: (enabled) => setAdFilter(service, enabled),
    onCopy(url) { GM_setClipboard(url, "text"); }
  }, autoOpen, { enabled: Ads.normalize(GM_getValue("adFilters", null))[service], label: "Ẩn khung quảng cáo trên " + label, help: "Ẩn khung đã nhận diện; không chặn kết nối mạng." });
  if (!panel) return;
  async function setAdFilter(id, enabled) {
    if (!Ads.services.some((item) => item.id === id) || typeof enabled !== "boolean") throw new Error("Tùy chọn quảng cáo không hợp lệ.");
    const next = { ...Ads.normalize(GM_getValue("adFilters", null)), [id]: enabled };
    await GM_setValue("adFilters", next); ads.setEnabled(next[service]); panel.setAdFilter(next[service]); emit({ settings: true });
    return { adFilters: next };
  }
  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener("adFilters", (name, oldValue, newValue) => { const enabled = Ads.normalize(newValue)[service]; ads.setEnabled(enabled); panel.setAdFilter(enabled); emit({ settings: true }); });
    GM_addValueChangeListener("autoOpen", (name, oldValue, newValue) => { autoOpen = !!newValue; panel.setPreference(autoOpen); emit({ settings: true }); });
    GM_addValueChangeListener("adskip:appSettings", () => emit({ settings: true }));
    GM_addValueChangeListener("adskip:historyRevision", () => emit({ history: true }));
  }
  window.addEventListener("pagehide", () => { generation++; controller?.abort(); void batch.stop(); }, { once: true });
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
      lastResult = { ...result, sourceUrl }; panel.render(lastResult);
      try { await library.record(sourceUrl, result); }
      catch (error) { if (generation === current) { lastResult.historyWarning = error.message; panel.render(lastResult); } }
      if (generation === current && Core.visitKey(sourceUrl) === Core.visitKey(location.href)) maybeOpen();
    } catch { if (generation === current) panel.render({ phase: "error", message: "Không đọc được dữ liệu trang. Tải lại trang rồi thử lại.", steps: [] }); }
  }
  await start();
})();

})();
