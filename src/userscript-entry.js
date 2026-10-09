(async function () {
  "use strict";
  const Core = globalThis.AdSkipCore;
  const Resolver = globalThis.AdSkipResolver;
  const Panel = globalThis.AdSkipPanel;
  const Ads = globalThis.AdSkipAds;
  if (window.top !== window || !Core.SERVICE_HOSTS.has(location.hostname)) return;
  Panel.prepareEz4Page();
  if (!document.documentElement) await new Promise((resolve) => {
    const observer = new MutationObserver(() => { if (document.documentElement) { observer.disconnect(); resolve(); } });
    observer.observe(document, { childList: true });
  });
  let autoOpen = !!GM_getValue("autoOpen", false);
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
  const maybeOpen = () => {
    if (autoOpen && lastResult?.phase === "resolved" && Core.isFileHost(lastResult.url) && Core.SERVICE_HOSTS.has(location.hostname) && Core.visitKey(lastResult.sourceUrl) === Core.visitKey(location.href) && Core.visitKey(lastResult.url) !== Core.visitKey(location.href)) location.replace(lastResult.url);
  };
  const panel = Panel.mount({
    onStart: start,
    onContinue: start,
    onStop() { generation++; controller?.abort(); lastResult = null; panel.render({ phase: "stopped", message: "Đã dừng xử lý.", code: "CANCELLED", steps: [] }); },
    onPreference(value) { autoOpen = value; GM_setValue("autoOpen", value); maybeOpen(); },
    async onAdFilter(enabled) {
      const next = { ...Ads.normalize(GM_getValue("adFilters", null)), [service]: enabled };
      await GM_setValue("adFilters", next); ads.setEnabled(enabled);
      return { adFilters: next };
    },
    onCopy(url) { GM_setClipboard(url, "text"); }
  }, autoOpen, { enabled: Ads.normalize(GM_getValue("adFilters", null))[service], label: "Ẩn khung quảng cáo trên " + label, help: "Ẩn khung đã nhận diện; không chặn kết nối mạng." });
  if (!panel) return;
  if (typeof GM_addValueChangeListener === "function") GM_addValueChangeListener("adFilters", (name, oldValue, newValue) => {
    const enabled = Ads.normalize(newValue)[service]; ads.setEnabled(enabled); panel.setAdFilter(enabled);
  });
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
