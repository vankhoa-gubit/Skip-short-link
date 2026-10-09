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
