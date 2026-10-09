(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"), require("./ads.js"));
  else root.AdSkipAdSettings = factory(root.AdSkipCore, root.AdSkipAds);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, Ads) {
  "use strict";
  function create(storage, dnr) {
    let queue = Promise.resolve();
    const enqueue = (operation) => { const task = queue.then(operation); queue = task.catch(() => {}); return task; };
    const read = async () => Ads.normalize((await storage.get("adFilters")).adFilters);
    const apply = (preferences) => dnr.updateEnabledRulesets({
      enableRulesetIds: Ads.services.filter(({ id }) => preferences[id]).map(({ id }) => id),
      disableRulesetIds: Ads.services.filter(({ id }) => !preferences[id]).map(({ id }) => id)
    });
    return {
      reconcile() { return enqueue(async () => { const preferences = await read(); await apply(preferences); return preferences; }); },
      set(service, enabled) {
        return enqueue(async () => {
          if (!Ads.services.some(({ id }) => id === service) || typeof enabled !== "boolean") throw new Core.AdSkipError("INVALID_FILTER", "Tùy chọn quảng cáo không hợp lệ.");
          const previous = await read(); const next = { ...previous, [service]: enabled };
          try { await apply(next); }
          catch { throw new Core.AdSkipError("FILTER_APPLY_FAILED", "Chưa thay đổi được bộ lọc quảng cáo. Thử lại."); }
          try { await storage.set({ adFilters: next }); }
          catch {
            try { await apply(previous); }
            catch { throw new Core.AdSkipError("FILTER_RESTORE_FAILED", "Chưa lưu hoặc khôi phục được bộ lọc. Mở lại popup để đồng bộ tùy chọn đã lưu."); }
            throw new Core.AdSkipError("FILTER_SAVE_FAILED", "Chưa lưu được tùy chọn quảng cáo. Thử lại.");
          }
          return next;
        });
      }
    };
  }
  return { create };
});
