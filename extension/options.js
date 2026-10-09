"use strict";
(async () => {
  async function send(type, extra = {}) {
    let reply;
    try { reply = await chrome.runtime.sendMessage({ type, ...extra }); }
    catch { throw new Error("Không kết nối được AdSkip. Tải lại trang quản lý."); }
    if (!reply || reply.error) throw new Error(reply?.error || "Chưa đọc được dữ liệu. Thử lại.");
    return reply;
  }
  const saved = await chrome.storage.session.get("dashboardSection");
  const api = {
    snapshot: () => send("ADSKIP_APP_GET"),
    getHistory: async () => (await send("ADSKIP_APP_HISTORY")).history,
    removeHistory: async (id) => (await send("ADSKIP_APP_HISTORY_REMOVE", { id })).history,
    clearHistory: async () => (await send("ADSKIP_APP_HISTORY_CLEAR")).history,
    openHistory: (id) => send("ADSKIP_APP_HISTORY_OPEN", { id }),
    startBatch: async (text) => (await send("ADSKIP_APP_BATCH_START", { text })).batch,
    stopBatch: async () => (await send("ADSKIP_APP_BATCH_STOP")).batch,
    resumeBatch: async () => (await send("ADSKIP_APP_BATCH_RESUME")).batch,
    retryBatch: async (id) => (await send("ADSKIP_APP_BATCH_RETRY", { id })).batch,
    continueBatch: async (id) => (await send("ADSKIP_APP_BATCH_CONTINUE", { id })).batch,
    openBatch: (id) => send("ADSKIP_APP_BATCH_OPEN", { id }),
    saveSettings: (settings) => send("ADSKIP_APP_SETTINGS", { settings }),
    setAdFilter: (service, enabled) => send("ADSKIP_AD_FILTER", { service, enabled }),
    copy: (text) => navigator.clipboard.writeText(text),
    subscribe(callback) {
      const listener = (changes, area) => {
        if (area === "session" && changes.batch?.newValue) callback({ batch: changes.batch.newValue });
        if (area === "session" && changes.dashboardSection) callback({ section: changes.dashboardSection.newValue });
        if (area === "local") callback({ history: !!changes.history, settings: !!(changes.appSettings || changes.autoOpen || changes.adFilters) });
      };
      chrome.storage.onChanged.addListener(listener); return () => chrome.storage.onChanged.removeListener(listener);
    }
  };
  globalThis.AdSkipWorkspace.mount(document.getElementById("workspace"), api, { section: saved.dashboardSection || "batch" });
})().catch(() => { document.getElementById("workspace").textContent = "Chưa mở được AdSkip. Tải lại trang quản lý hoặc Reload tiện ích."; });
