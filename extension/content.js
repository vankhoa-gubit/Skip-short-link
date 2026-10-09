(async function () {
  "use strict";
  const Core = globalThis.AdSkipCore;
  if (window.top !== window || !Core.SERVICE_HOSTS.has(location.hostname)) return;
  globalThis.AdSkipPanel.prepareEz4Page();
  if (!document.documentElement) await new Promise((resolve) => {
    const observer = new MutationObserver(() => { if (document.documentElement) { observer.disconnect(); resolve(); } });
    observer.observe(document, { childList: true });
  });
  let generation = 0; let controller;
  const send = (message) => chrome.runtime.sendMessage(message);
  const existing = await send({ type: "ADSKIP_GET" }).catch(() => ({}));
  const panel = globalThis.AdSkipPanel.mount({
    onStart: start,
    onContinue: start,
    async onStop() {
      generation++; controller?.abort();
      panel.render({ phase: "stopped", message: "Đã dừng xử lý.", code: "CANCELLED", steps: [] });
      await send({ type: "ADSKIP_STOP" }).catch(() => {});
    },
    onPreference(autoOpen) { return send({ type: "ADSKIP_PREFERENCE", autoOpen }); },
    onCopy(url) { return navigator.clipboard.writeText(url); }
  }, existing.preferences?.autoOpen);
  if (!panel) return;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === "ADSKIP_STATE") panel.render(message.state);
    if (message.type === "ADSKIP_PAGE_HINTS") {
      const pageUrl = location.href;
      globalThis.AdSkipPanel.pageHints(undefined, 1000).then((hints) => sendResponse({ pageUrl, hints })).catch(() => sendResponse({ pageUrl, hints: {} }));
      return true;
    }
  });
  if (existing.state) panel.render(existing.state);
  async function start(automatic = false) {
    controller?.abort(); controller = new AbortController(); const current = ++generation;
    panel.render({ phase: "resolving", message: "Đang đọc URL mà trang cung cấp…", steps: [] });
    try {
      const hints = await globalThis.AdSkipPanel.pageHints(controller.signal);
      if (generation !== current) return;
      const reply = await send({ type: "ADSKIP_RESOLVE", hints, automatic });
      if (generation !== current) return;
      panel.render(reply.state || { phase: "error", message: reply.error || "Không kết nối được extension. Tải lại trang.", steps: [] });
    } catch { if (generation === current) panel.render({ phase: "error", message: "Extension đã được tải lại. Tải lại trang để tiếp tục.", steps: [] }); }
  }
  await start(true);
})();
