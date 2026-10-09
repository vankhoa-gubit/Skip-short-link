(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.AdSkipBatch = factory(root.AdSkipCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  const idle = () => ({ phase: "idle", entries: [], duplicates: 0, revision: 0, message: "Dán mỗi link trên một dòng để bắt đầu." });
  function parse(text) {
    if (typeof text !== "string" || text.length > 819200) throw new Core.AdSkipError("BATCH_TOO_LARGE", "Danh sách quá dài. Mỗi lượt tối đa 50 dòng.");
    const lines = text.split(/\r?\n/).map((line, index) => ({ value: line.trim(), line: index + 1 })).filter(({ value }) => value);
    if (!lines.length || lines.length > 50) throw new Core.AdSkipError("BATCH_LIMIT", "Nhập từ 1 đến 50 dòng, mỗi dòng một URL HTTPS.");
    const seen = new Set(); const entries = []; let duplicates = 0;
    for (const { value, line } of lines) {
      let sourceUrl;
      try { sourceUrl = Core.inputUrl(value); }
      catch (error) { entries.push({ id: line, sourceLabel: "Dòng " + line + ": link không hợp lệ", phase: "error", code: error.code || "INVALID_URL", message: error.message, url: null }); continue; }
      if (seen.has(sourceUrl)) { duplicates++; continue; } seen.add(sourceUrl);
      entries.push({ id: line, sourceUrl, sourceLabel: Core.describeUrl(sourceUrl), phase: "queued", message: "Đang chờ", code: null, url: null });
    }
    return { entries, duplicates };
  }
  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
      const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    });
  }
  function create(options) {
    let job; let epoch = 0; let writes = Promise.resolve(); let controls = Promise.resolve();
    const enqueue = (operation) => { const task = controls.then(operation); controls = task.catch(() => {}); return task; };
    function publish(state, token) {
      const snapshot = structuredClone(state);
      const task = writes.catch(() => {}).then(async () => {
        if (token !== epoch) return null;
        const previous = (await options.storage.get("batch")).batch;
        snapshot.revision = (previous?.revision || 0) + 1; snapshot.updatedAt = Date.now();
        await options.storage.set({ batch: snapshot }); try { options.onState?.(snapshot); } catch { /* A view must not interrupt a saved queue. */ } return snapshot;
      });
      writes = task; return task;
    }
    async function read() {
      await writes.catch(() => {});
      const stored = (await options.storage.get("batch")).batch;
      return stored && Array.isArray(stored.entries) ? structuredClone(stored) : idle();
    }
    const pending = (entry) => ["queued", "resolving", "stopped"].includes(entry.phase) && !!entry.sourceUrl;
    function stopEntries(state, code) {
      for (const entry of state.entries) if (pending(entry)) Object.assign(entry, { phase: "stopped", url: null, code, message: code === "SESSION_INTERRUPTED" ? "Phiên bị ngắt. Chọn Chạy tiếp để kiểm tra lại." : "Đã dừng. Có thể chạy tiếp." });
      state.phase = "stopped"; state.activeId = null; state.message = code === "SESSION_INTERRUPTED" ? "Phiên xử lý bị ngắt. Kết quả đã xong được giữ lại; chọn Chạy tiếp khi cần." : "Đã dừng hàng đợi.";
    }
    async function current() {
      const state = await read();
      if (state.phase === "running" && !job) { stopEntries(state, "SESSION_INTERRUPTED"); return await publish(state, epoch); }
      return state;
    }
    async function pump(active, state, ids, overrides = {}) {
      try {
        for (let index = 0; index < ids.length; index++) {
          if (job !== active || active.controller.signal.aborted) return;
          if (index) await (options.wait || wait)((await options.getSettings()).batchDelayMs, active.controller.signal);
          if (job !== active) return;
          const entry = state.entries.find(({ id }) => id === ids[index]);
          state.activeId = entry.id; Object.assign(entry, { phase: "resolving", message: "Đang tìm trang đích…", url: null, code: null });
          await publish(state, active.token);
          if (job !== active || active.controller.signal.aborted) return;
          const result = await options.resolve({ ...entry, ...overrides[entry.id] }, {
            signal: active.controller.signal,
            onStep(step) { if (job === active) { entry.message = step.label + "…"; void publish(state, active.token).catch(() => {}); } }
          });
          if (job !== active || active.controller.signal.aborted) return;
          Object.assign(entry, { phase: result.phase, message: result.message, code: result.code, url: result.url || null });
          await publish(state, active.token);
          if (job !== active) return;
          if (options.onResult) {
            try { await options.onResult(entry.sourceUrl, result); }
            catch (error) { state.historyWarning = error.code === "HISTORY_SAVE_FAILED" ? error.message : "Chưa lưu được lịch sử của link vừa xử lý."; }
          }
          if (job !== active) return;
          if (result.code === "RATE_LIMITED") { state.phase = "paused"; state.activeId = null; state.message = "Dịch vụ giới hạn lượt truy cập. Hàng đợi tạm dừng; chờ một lúc rồi Chạy tiếp."; await publish(state, active.token); return; }
        }
        if (job === active) {
          state.phase = state.entries.some((entry) => pending(entry)) ? "paused" : "complete";
          state.activeId = null; state.message = state.phase === "complete" ? "Đã xử lý xong danh sách." : "Link đã được kiểm tra lại. Chọn Chạy tiếp cho các link còn chờ.";
          await publish(state, active.token);
        }
      } catch (error) {
        if (job === active) { stopEntries(state, "BATCH_INTERRUPTED"); state.message = "Hàng đợi bị ngắt. Kết quả đã xong được giữ; chọn Chạy tiếp để thử lại."; await publish(state, active.token).catch(() => {}); }
      } finally { if (job === active) job = null; }
    }
    async function launch(state, ids, overrides) {
      if (job) throw new Core.AdSkipError("BATCH_RUNNING", "Hàng đợi đang chạy. Dừng trước khi bắt đầu lượt khác.");
      const active = { token: ++epoch, controller: new AbortController(), state }; job = active;
      state.phase = "running"; state.activeId = null; state.message = "Đang xử lý lần lượt; hàng đợi không tự mở trang đích."; delete state.historyWarning;
      try { const initial = await publish(state, active.token); void pump(active, state, ids, overrides); return initial; }
      catch (error) { job = null; throw error; }
    }
    return {
      get() { return enqueue(current); },
      start(text) { return enqueue(async () => { const previous = await current(); const parsed = parse(text); return launch({ ...parsed, createdAt: Date.now(), revision: previous.revision }, parsed.entries.filter(({ phase }) => phase === "queued").map(({ id }) => id)); }); },
      resume() { return enqueue(async () => { const state = await current(); return launch(state, state.entries.filter(pending).map(({ id }) => id)); }); },
      retry(id, override) { return enqueue(async () => { const state = await current(); const entry = state.entries.find((item) => item.id === id); if (!entry?.sourceUrl) throw new Core.AdSkipError("INVALID_ENTRY", "Link này không thể chạy lại."); if (override?.startUrl) Core.inputUrl(override.startUrl); return launch(state, [id], override ? { [id]: override } : {}); }); },
      stop() { return enqueue(async () => { epoch++; job?.controller.abort(); job = null; const state = await read(); stopEntries(state, "CANCELLED"); return publish(state, epoch); }); },
      attachTab(id, tabId) { return enqueue(async () => { const state = job?.state || await current(); const entry = state.entries.find((item) => item.id === id); if (!entry) throw new Core.AdSkipError("INVALID_ENTRY", "Không tìm thấy link trong danh sách."); entry.manualTabId = tabId; return publish(state, epoch); }); }
    };
  }
  return { create, parse, idle, wait };
});
