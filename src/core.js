/* Shared URL rules. No evaluation of page JavaScript or encrypted payloads. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AdSkipCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "0.1.0";
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
    if ([401, 403, 429, 503].includes(response.status)) return new AdSkipError("NEEDS_VERIFICATION", "Trang yêu cầu xác minh hoặc đang giới hạn lượt truy cập. Hoàn tất thao tác trên trang rồi thử lại.");
    if ([404, 410].includes(response.status)) return new AdSkipError("EXPIRED_LINK", "Link không còn tồn tại hoặc đã hết hạn.");
    if (response.status < 200 || response.status >= 300) return new AdSkipError("HTTP_ERROR", "Trang trung gian trả HTTP " + response.status + ". Thử lại sau.");
    return null;
  }
  return { VERSION, SERVICE_HOSTS, FILE_HOSTS, AdSkipError, urlOf, hostIs, isFileHost, serviceOf, describeUrl, visitKey, decodeEntities, ez4Destination, oneShortInit, oneShortReply, buttonCandidate, canRequest, httpError };
});
