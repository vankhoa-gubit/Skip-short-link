(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.AdSkipFetch = factory(root.AdSkipCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  function create(fetcher = fetch) {
    return async function request(url, config = {}) {
      if (!Core.canRequest(url, config.method || "GET")) throw new Core.AdSkipError("REQUEST_DENIED", "Địa chỉ yêu cầu chưa được hỗ trợ.");
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
      config.signal?.addEventListener("abort", abort, { once: true });
      if (config.signal?.aborted) controller.abort();
      try {
        const post = config.method === "POST";
        const response = await fetcher(url, {
          method: config.method || "GET", credentials: "include", redirect: "follow", signal: controller.signal,
          headers: post ? { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Accept: "application/json" } : { Accept: "text/html" },
          body: post ? new URLSearchParams(config.fields).toString() : undefined
        });
        const finalUrl = response.url || url;
        // A Location already contains the answer in inspected /st flows.
        if (Core.isFileHost(finalUrl) || Core.ez4Destination(finalUrl)) {
          await response.body?.cancel();
          return { status: response.status, finalUrl, text: "" };
        }
        let text = "";
        if (response.body?.getReader) {
          const reader = response.body.getReader(); const decoder = new TextDecoder(); let total = 0;
          try {
            for (;;) {
              const chunk = await reader.read(); if (chunk.done) break;
              total += chunk.value.byteLength;
              if (total > 1048576) throw new Core.AdSkipError("RESPONSE_TOO_LARGE", "Phản hồi trang quá lớn để xử lý.");
              text += decoder.decode(chunk.value, { stream: true });
            }
            text += decoder.decode();
          } finally { await reader.cancel().catch(() => {}); }
        } else text = await response.text();
        return { status: response.status, finalUrl, text };
      } catch (error) {
        if (timedOut) throw new Core.AdSkipError("TIMEOUT", "Trang trung gian phản hồi quá lâu. Thử lại sau.");
        throw error;
      } finally { clearTimeout(timer); config.signal?.removeEventListener("abort", abort); }
    };
  }
  return { create };
});
