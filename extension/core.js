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
