"use strict";
importScripts("core.js", "adapters.js", "resolver.js", "fetch-transport.js", "ads.js", "ad-settings.js", "library.js", "batch.js");
const Core = globalThis.AdSkipCore;
const Ads = globalThis.AdSkipAds;
const filters = globalThis.AdSkipAdSettings.create(chrome.storage.local, chrome.declarativeNetRequest);
const syncFilters = () => { void filters.reconcile().catch(() => {}); };
// Chrome resets static enabled rulesets on upgrade; stored choices are authoritative.
syncFilters();
chrome.runtime.onInstalled.addListener(syncFilters);
chrome.runtime.onStartup.addListener(syncFilters);
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.adFilters) syncFilters(); });
async function preferences() {
  const stored = await chrome.storage.local.get({ autoOpen: false, adFilters: null });
  try { return { autoOpen: !!stored.autoOpen, adFilters: await filters.reconcile() }; }
  catch { return { autoOpen: !!stored.autoOpen, adFilters: Ads.normalize(stored.adFilters), adFilterError: "Chưa áp dụng được bộ lọc quảng cáo. Thử bật/tắt lại." }; }
}
const INPUT = "input";
const jobs = new Map();
const writes = new Map();
const versions = new Map();
const tabUrls = new Map();
const request = globalThis.AdSkipFetch.create();
const library = globalThis.AdSkipLibrary.create(chrome.storage.local);
const batch = globalThis.AdSkipBatch.create({
  storage: chrome.storage.session, getSettings: () => library.getSettings(), onResult: (url, result) => library.record(url, result),
  async resolve(entry, config) {
    const start = entry.startUrl || entry.sourceUrl;
    const hints = Number.isInteger(entry.readTabId) ? await readPageHints(entry.readTabId, start, config.signal) : {};
    return globalThis.AdSkipResolver.resolve(start, { ...config, ...hints, request });
  }
});
async function appSnapshot() {
  const config = await preferences();
  return { batch: await batch.get(), history: await library.getHistory(), settings: await library.getSettings(), adFilters: config.adFilters, adFilterError: config.adFilterError };
}
async function appMessage(message) {
  if (message.type === "ADSKIP_APP_GET") return appSnapshot();
  if (message.type === "ADSKIP_APP_SETTINGS") return { settings: await library.setSettings(message.settings) };
  if (message.type === "ADSKIP_APP_HISTORY") return { history: await library.getHistory() };
  if (message.type === "ADSKIP_APP_HISTORY_REMOVE") return { history: await library.removeHistory(message.id) };
  if (message.type === "ADSKIP_APP_HISTORY_CLEAR") return { history: await library.clearHistory() };
  if (message.type === "ADSKIP_APP_HISTORY_OPEN") {
    const entry = (await library.getHistory()).find(({ id }) => id === message.id);
    if (!entry?.url || !Core.isFileHost(entry.url)) throw new Core.AdSkipError("NO_DESTINATION", "Kết quả này không còn URL đích để mở.");
    await chrome.tabs.create({ url: Core.urlOf(entry.url).href }); return { ok: true };
  }
  if (message.type === "ADSKIP_APP_BATCH_START") return { batch: await batch.start(message.text) };
  if (message.type === "ADSKIP_APP_BATCH_STOP") return { batch: await batch.stop() };
  if (message.type === "ADSKIP_APP_BATCH_RESUME") return { batch: await batch.resume() };
  if (message.type === "ADSKIP_APP_BATCH_RETRY") return { batch: await batch.retry(message.id) };
  if (message.type === "ADSKIP_APP_BATCH_OPEN" || message.type === "ADSKIP_APP_BATCH_CONTINUE") {
    const entry = (await batch.get()).entries.find(({ id }) => id === message.id);
    if (!entry?.url || !["resolved", "manual"].includes(entry.phase)) throw new Core.AdSkipError("NO_DESTINATION", "Chưa có URL để mở cho link này.");
    if (message.type === "ADSKIP_APP_BATCH_OPEN") {
      const tab = await chrome.tabs.create({ url: Core.urlOf(entry.url).href });
      if (Core.canContinue(entry)) return { batch: await batch.attachTab(entry.id, tab.id) };
      return { ok: true };
    }
    if (!Core.canContinue(entry)) throw new Core.AdSkipError("NO_CONTINUATION", "Link này không có bước để tiếp tục.");
    const tab = Number.isInteger(entry.manualTabId) ? await chrome.tabs.get(entry.manualTabId).catch(() => null) : null;
    if (!tab?.url) throw new Core.AdSkipError("NO_MANUAL_TAB", "Chọn Mở bước, hoàn tất thao tác trong tab vừa mở rồi Tiếp tục.");
    return { batch: await batch.retry(entry.id, { startUrl: Core.inputUrl(tab.url), readTabId: tab.id }) };
  }
  throw new Core.AdSkipError("UNKNOWN_ACTION", "Thao tác không được hỗ trợ.");
}
const stateKey = (target) => target === INPUT ? INPUT : "tab:" + target;
const idle = () => ({ phase: "idle", message: "Dán link hoặc phân tích tab đang mở để bắt đầu.", steps: [] });

function stopJob(target) {
  jobs.get(target)?.controller.abort();
  jobs.delete(target);
  const version = (versions.get(target) || 0) + 1;
  versions.set(target, version);
  return version;
}
function publish(target, state, expectedJob, version = versions.get(target) || 0) {
  const queued = (writes.get(target) || Promise.resolve()).catch(() => {}).then(async () => {
    if ((versions.get(target) || 0) !== version || (expectedJob && jobs.get(target) !== expectedJob)) return;
    const value = { ...state, source: target === INPUT ? INPUT : "tab", updatedAt: Date.now() };
    await chrome.storage.session.set({ [stateKey(target)]: value });
    if (target !== INPUT) {
      if (value.sourceUrl) tabUrls.set(target, value.sourceUrl); else tabUrls.delete(target);
      const badge = { resolving: "…", resolved: "✓", manual: "!", error: "!" }[value.phase] || "";
      await chrome.action.setBadgeText({ tabId: target, text: badge }).catch(() => {});
      await chrome.action.setBadgeBackgroundColor({ tabId: target, color: value.phase === "resolved" ? "#23765b" : value.phase === "resolving" ? "#2b64c5" : "#9a5b0b" }).catch(() => {});
      await chrome.tabs.sendMessage(target, { type: "ADSKIP_STATE", state: value }).catch(() => {});
    }
    return value;
  });
  writes.set(target, queued);
  queued.finally(() => { if (writes.get(target) === queued) writes.delete(target); }).catch(() => {});
  return queued;
}
async function stateOf(target) {
  await (writes.get(target) || Promise.resolve()).catch(() => {});
  const version = versions.get(target) || 0;
  const state = (await chrome.storage.session.get(stateKey(target)))[stateKey(target)];
  if (!state) return idle();
  if (!Number.isFinite(state.updatedAt) || Date.now() - state.updatedAt > 60 * 60 * 1000) {
    return await publish(target, idle(), undefined, version) || stateOf(target);
  }
  if (state.phase === "resolving" && !jobs.has(target)) {
    const interrupted = { ...state, phase: "stopped", url: null, code: "SESSION_INTERRUPTED", message: "Phiên xử lý bị ngắt. Chọn Tìm lại để bắt đầu với dữ liệu mới." };
    return await publish(target, interrupted, undefined, version) || stateOf(target);
  }
  if (target !== INPUT && state.sourceUrl) tabUrls.set(target, state.sourceUrl);
  return state;
}
async function currentTabState(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return idle();
  const version = versions.get(tabId) || 0;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const state = await stateOf(tabId);
  if (state.sourceUrl && tab?.url) {
    let same = false;
    try { same = Core.visitKey(state.sourceUrl) === Core.visitKey(tab.url); } catch { /* Unsupported browser page. */ }
    if (!same) return await publish(tabId, idle(), undefined, version) || stateOf(tabId);
  }
  return state;
}
async function maybeOpen(target, result, expectedUrl) {
  if (target === INPUT || result.phase !== "resolved" || !Core.isFileHost(result.url)) return;
  const preferences = await chrome.storage.local.get({ autoOpen: false });
  if (!preferences.autoOpen) return;
  const tab = await chrome.tabs.get(target).catch(() => null);
  if (!tab?.url) return;
  const current = Core.urlOf(tab.url);
  if (!Core.SERVICE_HOSTS.has(current.hostname)) return;
  if (expectedUrl && Core.visitKey(current.href) !== Core.visitKey(expectedUrl)) return;
  if (Core.visitKey(current.href) !== Core.visitKey(result.url)) await chrome.tabs.update(target, { url: result.url });
}
async function readPageHints(tabId, expectedUrl, signal) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const reply = await chrome.tabs.sendMessage(tabId, { type: "ADSKIP_PAGE_HINTS" }).catch(() => null);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (!reply?.pageUrl) return {};
  try { if (Core.visitKey(reply.pageUrl) !== Core.visitKey(expectedUrl)) return {}; } catch { return {}; }
  return reply.hints || {};
}
function run(target, url, hints = {}, metadata = {}) {
  const start = Core.urlOf(url).href;
  const previous = jobs.get(target);
  if (previous?.url === start) return previous.promise;
  const version = stopJob(target);
  const controller = new AbortController();
  const sourceUrl = metadata.sourceUrl || start;
  const job = { url: start, sourceUrl, controller, version };
  jobs.set(target, job);
  job.promise = (async () => {
    let result;
    try {
      await publish(target, { phase: "resolving", message: "Đang đọc dữ liệu mới…", sourceUrl, steps: [], manualTabId: metadata.manualTabId }, job);
      const fresh = Number.isInteger(metadata.readTabId) ? await readPageHints(metadata.readTabId, start, controller.signal) : hints;
      result = await globalThis.AdSkipResolver.resolve(start, {
        initialCandidate: fresh.initialCandidate,
        initialHtml: typeof fresh.initialHtml === "string" ? fresh.initialHtml.slice(0, 1048576) : undefined,
        request, signal: controller.signal,
        onStep(step, steps) { void publish(target, { phase: "resolving", message: step.label + "…", sourceUrl, steps, manualTabId: metadata.manualTabId }, job); }
      });
      result = { ...result, sourceUrl, manualTabId: metadata.manualTabId };
      if (jobs.get(target) === job) {
        const saved = await publish(target, result, job);
        if (saved && jobs.get(target) === job) {
          try { await library.record(sourceUrl, result); }
          catch (error) { result.historyWarning = error.message || "Chưa lưu được lịch sử."; if (jobs.get(target) === job) await publish(target, result, job); }
        }
        if (jobs.get(target) === job) await maybeOpen(target, result, start).catch(() => {});
      }
    } catch {
      result = { phase: controller.signal.aborted ? "stopped" : "error", code: controller.signal.aborted ? "CANCELLED" : "STATE_ERROR", sourceUrl, steps: [], message: controller.signal.aborted ? "Đã dừng xử lý." : "Không đọc được phiên xử lý. Chọn Tìm lại." };
      if (jobs.get(target) === job) await publish(target, result, job).catch(() => {});
    } finally { if (jobs.get(target) === job) jobs.delete(target); }
    return result;
  })();
  return job.promise;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== "string") return;
  const fromExtensionPage = typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
  if (message.type.startsWith("ADSKIP_APP_")) {
    if (!fromExtensionPage) { sendResponse({ error: "Mở trang quản lý AdSkip để dùng lịch sử và hàng đợi." }); return; }
    appMessage(message).then(sendResponse).catch((error) => sendResponse({ error: error instanceof Core.AdSkipError ? error.message : "Chưa đọc hoặc lưu được dữ liệu AdSkip. Thử lại.", code: error.code || "APP_ERROR" }));
    return true;
  }
  if (message.type === "ADSKIP_DASHBOARD") {
    let permitted = fromExtensionPage;
    try { permitted ||= Core.SERVICE_HOSTS.has(Core.urlOf(sender.url || "").hostname) && (!sender.frameId || sender.frameId === 0); } catch { /* Invalid sender. */ }
    if (!permitted) { sendResponse({ error: "Mở AdSkip từ popup hoặc trang được hỗ trợ." }); return; }
    const section = ["batch", "history", "settings"].includes(message.section) ? message.section : "batch";
    chrome.storage.session.set({ dashboardSection: section }).then(() => chrome.runtime.openOptionsPage()).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ error: "Chưa mở được trang quản lý. Mở Cài đặt tiện ích trong trang quản lý extension." }));
    return true;
  }
  if (message.type === "ADSKIP_AD_FILTER") {
    let permitted = fromExtensionPage;
    try { permitted ||= Core.serviceOf(sender.url || "") === message.service && (!sender.frameId || sender.frameId === 0); } catch { /* Invalid sender. */ }
    if (!permitted) { sendResponse({ error: "Chỉ thay đổi bộ lọc của dịch vụ đang mở." }); return; }
    filters.set(message.service, message.enabled).then((adFilters) => sendResponse({ ok: true, adFilters })).catch((error) =>
      sendResponse({ error: error instanceof Core.AdSkipError ? error.message : "Chưa lưu được bộ lọc quảng cáo. Thử lại.", code: error.code || "FILTER_ERROR" }));
    return true;
  }
  if (message.source === INPUT && !fromExtensionPage) { sendResponse({ error: "Thao tác nhập link chỉ có trong popup." }); return; }
  const tabId = fromExtensionPage ? message.tabId : sender.tab?.id;
  let target = message.source === INPUT ? INPUT : tabId;
  if (target !== INPUT && (!Number.isInteger(tabId) || tabId < 0)) { sendResponse({ error: "Không xác định được tab đang mở." }); return; }
  (async () => {
    if (message.type === "ADSKIP_GET") {
      const inputState = fromExtensionPage ? await stateOf(INPUT) : undefined;
      if (fromExtensionPage && message.restore && (await chrome.storage.session.get("popupSource")).popupSource === INPUT && inputState.phase !== "idle") target = INPUT;
      return { state: target === INPUT ? inputState || await stateOf(INPUT) : await currentTabState(tabId), inputState, source: target === INPUT ? INPUT : "tab", preferences: await preferences() };
    }
    if (message.type === "ADSKIP_STOP") {
      const job = jobs.get(target); const version = stopJob(target);
      await (writes.get(target) || Promise.resolve()).catch(() => {});
      const previous = (await chrome.storage.session.get(stateKey(target)))[stateKey(target)] || idle();
      await publish(target, { ...previous, sourceUrl: job?.sourceUrl || previous.sourceUrl, phase: "stopped", message: "Đã dừng xử lý.", url: null, code: "CANCELLED" }, undefined, version);
      return { state: await stateOf(target) };
    }
    if (message.type === "ADSKIP_PREFERENCE") {
      await chrome.storage.local.set({ autoOpen: !!message.autoOpen });
      if (message.autoOpen && target !== INPUT) await maybeOpen(target, await currentTabState(tabId));
      return { ok: true };
    }
    if (message.type === "ADSKIP_OPEN") {
      const version = versions.get(target) || 0;
      const state = target === INPUT ? await stateOf(target) : await currentTabState(tabId);
      if (!state.url || state.phase === "resolving") return { error: "Chưa có URL để mở." };
      const opened = await chrome.tabs.create({ url: Core.urlOf(state.url).href });
      if (target === INPUT && Core.canContinue(state)) await publish(target, { ...state, manualTabId: opened.id }, undefined, version);
      return { ok: true };
    }
    if (message.type === "ADSKIP_RESOLVE" || message.type === "ADSKIP_CONTINUE") {
      const version = versions.get(target) || 0;
      if (target === INPUT) {
        const previous = await stateOf(INPUT);
        let url; let metadata = {};
        if (message.type === "ADSKIP_CONTINUE") {
          if (!Core.canContinue(previous)) return { state: previous };
          const manualTab = Number.isInteger(previous.manualTabId) ? await chrome.tabs.get(previous.manualTabId).catch(() => null) : null;
          if (!manualTab?.url) return { state: previous, error: "Mở bước hiện tại, hoàn tất thao tác trên trang rồi tiếp tục kiểm tra." };
          url = Core.inputUrl(manualTab.url);
          metadata = { sourceUrl: previous.sourceUrl, manualTabId: manualTab.id, readTabId: manualTab.id };
        } else url = Core.inputUrl(message.url);
        if ((versions.get(target) || 0) !== version) return { state: await stateOf(target) };
        await chrome.storage.session.set({ popupSource: INPUT });
        if ((versions.get(target) || 0) !== version) return { state: await stateOf(target) };
        return { state: await run(INPUT, url, {}, metadata), source: INPUT };
      }
      const tab = await chrome.tabs.get(tabId);
      const url = fromExtensionPage ? tab.url : sender.url || sender.tab?.url;
      if ((versions.get(target) || 0) !== version) return { state: await stateOf(target) };
      if (!url || !Core.SERVICE_HOSTS.has(Core.urlOf(url).hostname)) {
        const state = { phase: "manual", message: "Dán link vào ô nhập hoặc mở tab 1shortlink, EZ4Short, Tech8s để phân tích.", code: "UNSUPPORTED_TAB", steps: [] };
        await publish(tabId, state); return { state };
      }
      if (!fromExtensionPage && (!tab.url || Core.visitKey(url) !== Core.visitKey(tab.url))) return { state: await currentTabState(tabId) };
      if (!fromExtensionPage && message.automatic) {
        const existing = await stateOf(tabId);
        if (existing.phase === "resolved" && existing.sourceUrl && Core.visitKey(existing.sourceUrl) === Core.visitKey(url)) return { state: existing };
      }
      if (fromExtensionPage) await chrome.storage.session.set({ popupSource: "tab" });
      if ((versions.get(target) || 0) !== version) return { state: await stateOf(target) };
      return { state: await run(tabId, url, fromExtensionPage ? {} : message.hints || {}, fromExtensionPage ? { readTabId: tabId } : {}), source: "tab" };
    }
    return { error: "Thao tác không được hỗ trợ." };
  })().then(sendResponse).catch((error) => sendResponse({ error: error instanceof Core.AdSkipError ? error.message : "Không đọc được tab hoặc phiên xử lý. Tải lại trang rồi thử lại.", code: error instanceof Core.AdSkipError ? error.code : "STATE_ERROR" }));
  return true;
});

// Capture /st before the site can replace its original query.
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0 || details.tabId < 0) return;
  let target; try { target = Core.ez4Destination(details.url); } catch { return; }
  if (!target || !Core.isFileHost(target)) return;
  const version = stopJob(details.tabId);
  const state = { phase: "resolved", message: "Đã tìm địa chỉ đích. Chưa kiểm tra tình trạng file.", sourceUrl: details.url, url: target, code: null,
    steps: [{ label: "Nhận URL trước khi EZ4Short chuyển bước", url: Core.describeUrl(details.url) }, { label: "Đã tìm địa chỉ đích", url: Core.describeUrl(target) }] };
  void publish(details.tabId, state, undefined, version).then(async (value) => { if (value && (versions.get(details.tabId) || 0) === version) { await library.record(details.url, value).catch(() => {}); if ((versions.get(details.tabId) || 0) === version) await maybeOpen(details.tabId, value, details.url); } }).catch(() => {});
}, { url: [{ hostEquals: "ez4short.com" }, { hostEquals: "www.ez4short.com" }] });
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (!change.url && change.status !== "loading") return;
  const known = tabUrls.get(tabId);
  if (change.url) {
    try {
      const destination = Core.ez4Destination(change.url);
      if (destination && Core.isFileHost(destination)) return;
      if (known && Core.visitKey(known) === Core.visitKey(change.url) && change.status !== "loading") return;
    } catch { /* Clear an old result when the new URL is unsupported. */ }
  } else if (!jobs.has(tabId)) return;
  const version = stopJob(tabId);
  void chrome.storage.session.get(stateKey(tabId)).then((data) => {
    if (data[stateKey(tabId)]) return publish(tabId, idle(), undefined, version);
  }).catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => {
  stopJob(tabId); tabUrls.delete(tabId);
  void (writes.get(tabId) || Promise.resolve()).catch(() => {}).then(() => chrome.storage.session.remove(stateKey(tabId))).finally(() => versions.delete(tabId));
});
