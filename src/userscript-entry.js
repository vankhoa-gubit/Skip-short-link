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
    const abort = () => { handle.abort(); reject(new DOMException("Aborted", "AbortError")); };
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
    if (autoOpen && lastResult?.phase === "resolved" && Core.isFileHost(lastResult.url) && Core.visitKey(lastResult.url) !== Core.visitKey(location.href)) location.replace(lastResult.url);
  };
  const panel = Panel.mount({
    onStart: start,
    onStop() { generation++; controller?.abort(); panel.render({ phase: "stopped", message: "Đã dừng xử lý.", steps: [] }); },
    onPreference(value) { autoOpen = value; GM_setValue("autoOpen", value); maybeOpen(); },
    onCopy(url) { GM_setClipboard(url, "text"); }
  }, autoOpen);
  if (!panel) return;
  async function start() {
    controller?.abort(); controller = new AbortController();
    const current = ++generation;
    panel.render({ phase: "resolving", message: "Đang đọc URL mà trang cung cấp…", steps: [] });
    try {
      const hints = await Panel.pageHints(controller.signal);
      if (generation !== current) return;
      const result = await Resolver.resolve(location.href, {
        ...hints, request, signal: controller.signal,
        onStep(step, steps) { if (generation === current) panel.render({ phase: "resolving", message: step.label + "…", steps }); }
      });
      if (generation !== current) return;
      lastResult = result; panel.render(result); maybeOpen();
    } catch { if (generation === current) panel.render({ phase: "error", message: "Không đọc được dữ liệu trang. Tải lại trang rồi thử lại.", steps: [] }); }
  }
  await start();
})();
