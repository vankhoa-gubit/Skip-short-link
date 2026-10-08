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
    async onStop() { generation++; controller?.abort(); await send({ type: "ADSKIP_STOP" }); },
    onPreference(autoOpen) { return send({ type: "ADSKIP_PREFERENCE", autoOpen }); },
    onCopy(url) { return navigator.clipboard.writeText(url); }
  }, existing.preferences?.autoOpen);
  if (!panel) return;
  chrome.runtime.onMessage.addListener((message) => { if (message.type === "ADSKIP_STATE") panel.render(message.state); });
  if (existing.state) panel.render(existing.state);
  async function start() {
    controller?.abort(); controller = new AbortController(); const current = ++generation;
    panel.render({ phase: "resolving", message: "Đang đọc URL mà trang cung cấp…", steps: [] });
    try {
      const hints = await globalThis.AdSkipPanel.pageHints(controller.signal);
      if (generation !== current) return;
      const reply = await send({ type: "ADSKIP_RESOLVE", hints });
      if (generation !== current) return;
      panel.render(reply.state || { phase: "error", message: reply.error || "Không kết nối được extension. Tải lại trang.", steps: [] });
    } catch { if (generation === current) panel.render({ phase: "error", message: "Extension đã được tải lại. Tải lại trang để tiếp tục.", steps: [] }); }
  }
  await start();
})();
