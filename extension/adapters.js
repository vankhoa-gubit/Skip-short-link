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
