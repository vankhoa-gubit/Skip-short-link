(async function () {
  "use strict";
  const Core = globalThis.AdSkipCore;
  const Resolver = globalThis.AdSkipResolver;
  const Panel = globalThis.AdSkipPanel;
  const Ads = globalThis.AdSkipAds;
  const Library = globalThis.AdSkipLibrary;
  const Batch = globalThis.AdSkipBatch;
  const Workspace = globalThis.AdSkipWorkspace;
  if (window.top !== window || !Core.SERVICE_HOSTS.has(location.hostname)) return;
  Panel.prepareEz4Page();
  if (!document.documentElement) await new Promise((resolve) => {
    const observer = new MutationObserver(() => { if (document.documentElement) { observer.disconnect(); resolve(); } });
    observer.observe(document, { childList: true });
  });
  const listeners = new Set();
  const emit = (change) => { for (const listener of listeners) { try { listener(change); } catch { /* A view must not interrupt the queue. */ } } };
  const keyOf = (key) => key === "autoOpen" ? key : "adskip:" + key;
  const storage = {
    async get(keys) {
      const defaults = typeof keys === "string" ? { [keys]: undefined } : keys;
      return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, GM_getValue(keyOf(key), fallback)]));
    },
    async set(values) { for (const [key, value] of Object.entries(values)) await GM_setValue(keyOf(key), value); emit({ settings: true }); }
  };
  const historyPrefix = "adskip:history:";
  async function changedHistory() {
    emit({ history: true });
    await GM_setValue("adskip:historyRevision", crypto.randomUUID());
  }
  // One GM key per result prevents two tabs from replacing each other's history.
  const historyStore = {
    async list() { return GM_listValues().filter((key) => key.startsWith(historyPrefix)).map((key) => GM_getValue(key, null)); },
    async append(entry) { await GM_setValue(historyPrefix + entry.id, entry); await changedHistory(); },
    async remove(id) { await GM_deleteValue(historyPrefix + id); await changedHistory(); }
  };
  const library = Library.create(storage, historyStore);
  let autoOpen = (await library.getSettings()).autoOpen;
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
  let memory = {};
  const batch = Batch.create({
    storage: { async get(key) { return { [key]: structuredClone(memory[key]) }; }, async set(value) { memory = { ...memory, ...structuredClone(value) }; } },
    getSettings: () => library.getSettings(),
    onResult: (url, result) => library.record(url, result),
    onState: (state) => emit({ batch: state }),
    async resolve(entry, config) {
      const hints = Core.visitKey(entry.sourceUrl) === Core.visitKey(location.href) ? await Panel.pageHints(config.signal) : {};
      return Resolver.resolve(entry.sourceUrl, { ...config, ...hints, request });
    }
  });
  const openUrl = (url) => GM_openInTab(Core.inputUrl(url), { active: true, insert: true, setParent: true });
  let dialog; let manager;
  async function openManager() {
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.id = "adskip-dialog"; dialog.setAttribute("aria-label", "Quản lý AdSkip");
      dialog.style.cssText = "width:1120px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);padding:0;border:1px solid #bcc9da;border-radius:10px;background:#f7fafc;color:#172b4d;box-shadow:0 16px 60px #172b4d40;";
      (document.body || document.documentElement).append(dialog);
      const api = {
        async snapshot() { return { batch: await batch.get(), history: await library.getHistory(), settings: await library.getSettings(), adFilters: Ads.normalize(GM_getValue("adFilters", null)) }; },
        getHistory: () => library.getHistory(), removeHistory: (id) => library.removeHistory(id), clearHistory: () => library.clearHistory(),
        async openHistory(id) { const entry = (await library.getHistory()).find((record) => record.id === id); if (!entry?.url || !Core.isFileHost(entry.url)) throw new Error("Kết quả này không còn URL đích để mở."); openUrl(entry.url); },
        startBatch: (text) => batch.start(text), stopBatch: () => batch.stop(), resumeBatch: () => batch.resume(), retryBatch: (id) => batch.retry(id),
        async openBatch(id) { const entry = (await batch.get()).entries.find((record) => record.id === id); if (!entry?.url || !["resolved", "manual"].includes(entry.phase)) throw new Error("Chưa có URL để mở cho link này."); openUrl(entry.url); },
        async saveSettings(settings) { const next = await library.setSettings(settings); autoOpen = next.autoOpen; panel.setPreference(autoOpen); return { settings: next }; },
        setAdFilter,
        copy: (text) => GM_setClipboard(text, "text"),
        subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); }
      };
      manager = Workspace.mount(dialog, api, { userscript: true, onClose: () => dialog.close() });
    }
    if (!dialog.open) dialog.showModal();
    await manager.ready;
  }
  const maybeOpen = () => {
    if (autoOpen && lastResult?.phase === "resolved" && Core.isFileHost(lastResult.url) && Core.SERVICE_HOSTS.has(location.hostname) && Core.visitKey(lastResult.sourceUrl) === Core.visitKey(location.href) && Core.visitKey(lastResult.url) !== Core.visitKey(location.href)) location.replace(lastResult.url);
  };
  const panel = Panel.mount({
    onStart: start,
    onContinue: start,
    onManager: openManager,
    onStop() { generation++; controller?.abort(); lastResult = null; panel.render({ phase: "stopped", message: "Đã dừng xử lý.", code: "CANCELLED", steps: [] }); },
    async onPreference(value) {
      try { await library.setSettings({ autoOpen: value }); autoOpen = value; maybeOpen(); }
      catch { panel.setPreference(autoOpen); panel.render({ ...lastResult, historyWarning: "Chưa lưu được tùy chọn. Thử lại." }); }
    },
    onAdFilter: (enabled) => setAdFilter(service, enabled),
    onCopy(url) { GM_setClipboard(url, "text"); }
  }, autoOpen, { enabled: Ads.normalize(GM_getValue("adFilters", null))[service], label: "Ẩn khung quảng cáo trên " + label, help: "Ẩn khung đã nhận diện; không chặn kết nối mạng." });
  if (!panel) return;
  async function setAdFilter(id, enabled) {
    if (!Ads.services.some((item) => item.id === id) || typeof enabled !== "boolean") throw new Error("Tùy chọn quảng cáo không hợp lệ.");
    const next = { ...Ads.normalize(GM_getValue("adFilters", null)), [id]: enabled };
    await GM_setValue("adFilters", next); ads.setEnabled(next[service]); panel.setAdFilter(next[service]); emit({ settings: true });
    return { adFilters: next };
  }
  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener("adFilters", (name, oldValue, newValue) => { const enabled = Ads.normalize(newValue)[service]; ads.setEnabled(enabled); panel.setAdFilter(enabled); emit({ settings: true }); });
    GM_addValueChangeListener("autoOpen", (name, oldValue, newValue) => { autoOpen = !!newValue; panel.setPreference(autoOpen); emit({ settings: true }); });
    GM_addValueChangeListener("adskip:appSettings", () => emit({ settings: true }));
    GM_addValueChangeListener("adskip:historyRevision", () => emit({ history: true }));
  }
  window.addEventListener("pagehide", () => { generation++; controller?.abort(); void batch.stop(); }, { once: true });
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
      lastResult = { ...result, sourceUrl }; panel.render(lastResult);
      try { await library.record(sourceUrl, result); }
      catch (error) { if (generation === current) { lastResult.historyWarning = error.message; panel.render(lastResult); } }
      if (generation === current && Core.visitKey(sourceUrl) === Core.visitKey(location.href)) maybeOpen();
    } catch { if (generation === current) panel.render({ phase: "error", message: "Không đọc được dữ liệu trang. Tải lại trang rồi thử lại.", steps: [] }); }
  }
  await start();
})();
