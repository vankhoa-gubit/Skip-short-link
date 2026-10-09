(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.AdSkipLibrary = factory(root.AdSkipCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  const defaults = { autoOpen: false, saveHistory: true, historyLimit: 100, batchDelayMs: 1000 };
  function normalizeSettings(value = {}) {
    return { autoOpen: typeof value.autoOpen === "boolean" ? value.autoOpen : false,
      saveHistory: typeof value.saveHistory === "boolean" ? value.saveHistory : true,
      historyLimit: [25, 100, 250].includes(value.historyLimit) ? value.historyLimit : 100,
      batchDelayMs: [500, 1000, 2000].includes(value.batchDelayMs) ? value.batchDelayMs : 1000 };
  }
  function normalizeHistory(records) {
    if (!Array.isArray(records)) return [];
    return records.flatMap((record) => {
      if (!record || typeof record.id !== "string" || record.id.length > 80 || !Number.isFinite(record.createdAt) ||
          !["resolved", "manual", "error"].includes(record.phase) || typeof record.sourceLabel !== "string") return [];
      let url = null;
      try { if (record.phase === "resolved" && Core.isFileHost(record.url)) url = Core.urlOf(record.url).href; } catch { /* Discard unsafe destinations. */ }
      if (record.phase === "resolved" && !url) return [];
      return [{ id: record.id, createdAt: record.createdAt, sourceLabel: record.sourceLabel.slice(0, 200), phase: record.phase,
        message: typeof record.message === "string" ? record.message.slice(0, 500) : "", code: typeof record.code === "string" ? record.code.slice(0, 64) : null, url }];
    }).sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  }
  function create(storage, historyStore) {
    let queue = Promise.resolve();
    const enqueue = (operation) => { const task = queue.then(operation); queue = task.catch(() => {}); return task; };
    const readSettings = async () => {
      const data = await storage.get({ appSettings: null, autoOpen: false });
      return normalizeSettings({ ...data.appSettings, autoOpen: data.autoOpen });
    };
    const readHistory = async () => normalizeHistory(historyStore ? await historyStore.list() : (await storage.get("history")).history);
    const writeHistory = (history) => storage.set({ history });
    const trim = async (limit) => {
      const current = await readHistory();
      if (historyStore) { for (const record of current.slice(limit)) await historyStore.remove(record.id); }
      else await writeHistory(current.slice(0, limit));
    };
    return {
      getSettings() { return enqueue(readSettings); },
      setSettings(patch) {
        return enqueue(async () => {
          if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => !(key in defaults))) throw new Core.AdSkipError("INVALID_SETTINGS", "Tùy chọn không hợp lệ.");
          const next = { ...await readSettings(), ...patch };
          if (JSON.stringify(next) !== JSON.stringify(normalizeSettings(next))) throw new Core.AdSkipError("INVALID_SETTINGS", "Kiểm tra giới hạn lịch sử và thời gian giữa các link.");
          const { autoOpen, ...appSettings } = next;
          await storage.set({ appSettings, autoOpen });
          await trim(next.historyLimit);
          return next;
        });
      },
      getHistory() { return enqueue(async () => (await readHistory()).slice(0, (await readSettings()).historyLimit)); },
      record(sourceUrl, result) {
        return enqueue(async () => {
          if (!["resolved", "manual", "error"].includes(result?.phase)) return null;
          const settings = await readSettings(); if (!settings.saveHistory) return null;
          // Persist only the redacted source label. Input/ciphertext stays in session state.
          const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
          const [entry] = normalizeHistory([{ id, createdAt: Date.now(), sourceLabel: Core.describeUrl(sourceUrl), phase: result.phase, message: result.message, code: result.code, url: result.url }]);
          if (!entry) return null;
          try {
            if (historyStore) { await historyStore.append(entry); await trim(settings.historyLimit); }
            else await writeHistory(normalizeHistory([entry, ...await readHistory()]).slice(0, settings.historyLimit));
          } catch { throw new Core.AdSkipError("HISTORY_SAVE_FAILED", "Đã xử lý link nhưng chưa lưu được lịch sử. Kiểm tra dung lượng lưu trữ hoặc tắt lưu lịch sử."); }
          return entry;
        });
      },
      removeHistory(id) { return enqueue(async () => { if (historyStore) await historyStore.remove(id); else await writeHistory((await readHistory()).filter((entry) => entry.id !== id)); return readHistory(); }); },
      clearHistory() { return enqueue(async () => { if (historyStore) { for (const entry of await readHistory()) await historyStore.remove(entry.id); } else await writeHistory([]); return []; }); }
    };
  }
  return { defaults, normalizeSettings, normalizeHistory, create };
});
