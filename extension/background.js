"use strict";
importScripts("core.js", "resolver.js", "fetch-transport.js");
const Core = globalThis.AdSkipCore;
const jobs = new Map();
const writes = new Map();
const request = globalThis.AdSkipFetch.create();
const stateKey = (tabId) => "tab:" + tabId;
const idle = () => ({ phase: "idle", message: "Mở link 1short hoặc EZ4Short để bắt đầu.", steps: [] });
async function stateOf(tabId) {
  const key = stateKey(tabId); const data = await chrome.storage.session.get(key);
  const state = data[key];
  if (!state) return idle();
  if (Date.now() - state.updatedAt > 60 * 60 * 1000) { await chrome.storage.session.remove(key); return idle(); }
  if (state.phase === "resolving" && !jobs.has(tabId) && Date.now() - state.updatedAt > 60000) return { ...state, phase: "stopped", message: "Phiên xử lý đã kết thúc. Chọn Tìm lại để tiếp tục." };
  return state;
}
function publish(tabId, state, expectedJob) {
  const queued = (writes.get(tabId) || Promise.resolve()).catch(() => {}).then(async () => {
    if (expectedJob && jobs.get(tabId) !== expectedJob) return;
    const value = { ...state, updatedAt: Date.now() };
    await chrome.storage.session.set({ [stateKey(tabId)]: value });
    const badge = { resolving: "…", resolved: "✓", manual: "!", error: "!" }[state.phase] || "";
    await chrome.action.setBadgeText({ tabId, text: badge }).catch(() => {});
    await chrome.action.setBadgeBackgroundColor({ tabId, color: state.phase === "resolved" ? "#23765b" : state.phase === "resolving" ? "#2b64c5" : "#9a5b0b" }).catch(() => {});
    await chrome.tabs.sendMessage(tabId, { type: "ADSKIP_STATE", state: value }).catch(() => {});
  });
  writes.set(tabId, queued);
  queued.finally(() => { if (writes.get(tabId) === queued) writes.delete(tabId); }).catch(() => {});
  return queued;
}
function stopJob(tabId) { jobs.get(tabId)?.controller.abort(); jobs.delete(tabId); }
async function maybeOpen(tabId, result, expectedUrl) {
  if (result.phase !== "resolved" || !Core.isFileHost(result.url)) return;
  const preferences = await chrome.storage.local.get({ autoOpen: false });
  if (preferences.autoOpen) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab?.url) return;
    const current = Core.urlOf(tab.url);
    if (!Core.SERVICE_HOSTS.has(current.hostname)) return;
    if (expectedUrl && Core.visitKey(current.href) !== Core.visitKey(expectedUrl)) return;
    if (Core.visitKey(current.href) !== Core.visitKey(result.url)) await chrome.tabs.update(tabId, { url: result.url });
  }
}
async function run(tabId, url, hints = {}) {
  const start = Core.urlOf(url).href;
  const previous = jobs.get(tabId);
  if (previous?.url === start) return previous.promise;
  stopJob(tabId);
  const controller = new AbortController(); const job = { url: start, controller }; jobs.set(tabId, job);
  job.promise = (async () => {
    await publish(tabId, { phase: "resolving", message: "Đang đọc dữ liệu trang…", steps: [] }, job);
    const result = await globalThis.AdSkipResolver.resolve(start, {
      initialCandidate: hints.initialCandidate,
      initialHtml: typeof hints.initialHtml === "string" ? hints.initialHtml.slice(0, 1048576) : undefined,
      request, signal: controller.signal,
      onStep(step, steps) { void publish(tabId, { phase: "resolving", message: step.label + "…", steps }, job); }
    });
    if (jobs.get(tabId) === job) { await publish(tabId, result, job); jobs.delete(tabId); await maybeOpen(tabId, result, start).catch(() => {}); }
    return result;
  })();
  return job.promise;
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== "string") return;
  // Content scripts stay bound to their own tab. Trusted extension pages
  // (including a popup opened in a tab for diagnostics) select the active tab.
  const fromExtensionPage = typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
  const tabId = fromExtensionPage ? message.tabId : sender.tab?.id;
  if (!Number.isInteger(tabId) || tabId < 0) { sendResponse({ error: "Không xác định được tab đang mở." }); return; }
  (async () => {
    if (message.type === "ADSKIP_GET") return { state: await stateOf(tabId), preferences: await chrome.storage.local.get({ autoOpen: false }) };
    if (message.type === "ADSKIP_STOP") { stopJob(tabId); await publish(tabId, { phase: "stopped", message: "Đã dừng xử lý.", steps: [] }); return { state: await stateOf(tabId) }; }
    if (message.type === "ADSKIP_PREFERENCE") { await chrome.storage.local.set({ autoOpen: !!message.autoOpen }); if (message.autoOpen) await maybeOpen(tabId, await stateOf(tabId)); return { ok: true }; }
    if (message.type === "ADSKIP_OPEN") {
      const state = await stateOf(tabId);
      if (!state.url) return { error: "Chưa có URL để mở." };
      await chrome.tabs.create({ url: Core.urlOf(state.url).href }); return { ok: true };
    }
    if (message.type === "ADSKIP_RESOLVE") {
      const tab = await chrome.tabs.get(tabId); const url = fromExtensionPage ? tab.url : sender.url || sender.tab?.url;
      if (!url || !Core.SERVICE_HOSTS.has(Core.urlOf(url).hostname)) {
        const state = { phase: "manual", message: "Mở link 1short, EZ4Short hoặc Tech8s để dùng bộ xử lý hiện tại.", code: "UNSUPPORTED_TAB", steps: [] };
        await publish(tabId, state); return { state };
      }
      return { state: await run(tabId, url, fromExtensionPage ? {} : message.hints) };
    }
    return { error: "Thao tác không được hỗ trợ." };
  })().then(sendResponse).catch(() => sendResponse({ error: "Không đọc được tab hoặc trạng thái xử lý. Tải lại trang rồi thử lại." }));
  return true;
});
// Preserve /st's original query before the page auto-submits its form.
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0 || details.tabId < 0) return;
  let target; try { target = Core.ez4Destination(details.url); } catch { return; }
  if (!target || !Core.isFileHost(target)) return;
  stopJob(details.tabId);
  const state = { phase: "resolved", message: "Đã tìm địa chỉ đích. Chưa kiểm tra tình trạng file.", url: target, code: null,
    steps: [{ label: "Nhận URL trước khi EZ4Short chuyển bước", url: Core.describeUrl(details.url) }, { label: "Đã tìm địa chỉ đích", url: Core.describeUrl(target) }] };
  void publish(details.tabId, state).then(() => maybeOpen(details.tabId, state, details.url)).catch(() => {});
}, { url: [{ hostEquals: "ez4short.com" }, { hostEquals: "www.ez4short.com" }] });
chrome.tabs.onRemoved.addListener((tabId) => {
  stopJob(tabId);
  void (writes.get(tabId) || Promise.resolve()).catch(() => {}).then(() => chrome.storage.session.remove(stateKey(tabId)));
});
