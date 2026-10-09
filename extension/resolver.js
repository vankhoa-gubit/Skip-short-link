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
