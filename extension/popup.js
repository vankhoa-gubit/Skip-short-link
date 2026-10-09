"use strict";
const Core = globalThis.AdSkipCore;
const node = (id) => document.getElementById(id);
let tabId; let source = "tab"; let currentState; let noticeTimer; let generation = 0;
function notice(text) { node("notice").textContent = text; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { node("notice").textContent = ""; }, 5000); }
function fieldError(message = "") {
  node("input-error").textContent = message;
  node("input-error").classList.toggle("hidden", !message);
  node("link-input").setAttribute("aria-invalid", message ? "true" : "false");
}
function render(state) {
  if (state.updatedAt && currentState?.updatedAt && state.updatedAt < currentState.updatedAt) return;
  currentState = state;
  const labels = { idle: "Sẵn sàng", resolving: "Đang tìm trang đích", resolved: "Đã tìm được trang đích", manual: "Cần thao tác trên trang", error: "Chưa lấy được link", stopped: "Đã dừng" };
  node("status").textContent = labels[state.phase] || labels.idle;
  node("message").textContent = state.message || "";
  node("source-label").textContent = source === "input" ? "Kết quả link đã dán" : "Kết quả tab đang mở";
  let url; try { if (state.url && state.phase !== "resolving") url = Core.urlOf(state.url).href; } catch { /* No unsafe links. */ }
  for (const id of ["destination", "open", "copy"]) node(id).classList.toggle("hidden", !url);
  if (url) { node("destination").href = url; node("destination").textContent = url; } else node("destination").removeAttribute("href");
  node("open").textContent = state.phase === "resolved" ? "Mở trang đích" : "Mở bước hiện tại";
  const busy = state.phase === "resolving";
  node("input-resolve").disabled = source === "input" && busy;
  node("resolve").disabled = source === "tab" && busy;
  node("stop").classList.toggle("hidden", !busy);
  node("retry").classList.toggle("hidden", !["error", "stopped"].includes(state.phase));
  const resumable = Core.canContinue(state);
  node("continue").classList.toggle("hidden", !resumable);
  node("continue-help").classList.toggle("hidden", !resumable);
  node("continue-help").textContent = source === "input" ? "Mở bước hiện tại, hoàn tất thao tác trên trang rồi chọn Tiếp tục kiểm tra." : "Hoàn tất thao tác trên trang đang mở rồi chọn Tiếp tục kiểm tra.";
  node("auto-open").disabled = source === "input";
  node("preference-help").classList.toggle("hidden", source !== "input");
  node("steps").replaceChildren();
  for (const step of state.steps || []) {
    const item = document.createElement("li"); item.textContent = step.label;
    const urlLabel = document.createElement("span"); urlLabel.className = "step-url"; urlLabel.textContent = step.url; item.append(urlLabel); node("steps").append(item);
  }
}
async function send(type, extra = {}) {
  try {
    const response = await chrome.runtime.sendMessage({ type, tabId, source, ...extra });
    if (!response) throw new Error("No response");
    return response;
  } catch { return { error: "Không kết nối được extension. Đóng rồi mở lại popup.", code: "CONNECTION_LOST" }; }
}
async function start(type, mode, extra = {}) {
  const current = ++generation;
  source = mode; currentState = null;
  render({ phase: "resolving", message: "Đang đọc dữ liệu mới…", steps: [] });
  const reply = await send(type, extra);
  if (generation !== current) return;
  if (reply.source) source = reply.source;
  if (reply.error) notice(reply.error);
  render(reply.state || { phase: "error", message: reply.error || "Chưa đọc được kết quả. Chọn Tìm lại.", steps: [] });
}
node("link-input").addEventListener("input", () => fieldError());
node("link-form").addEventListener("submit", (event) => {
  event.preventDefault();
  let url;
  try { url = Core.inputUrl(node("link-input").value); }
  catch (error) { fieldError(error.message); node("link-input").focus(); return; }
  fieldError();
  void start("ADSKIP_RESOLVE", "input", { url });
});
node("resolve").addEventListener("click", () => start("ADSKIP_RESOLVE", "tab"));
node("continue").addEventListener("click", () => start("ADSKIP_CONTINUE", source));
node("retry").addEventListener("click", () => {
  if (source === "input") {
    const url = currentState?.sourceUrl;
    if (url) return start("ADSKIP_RESOLVE", "input", { url });
    node("link-input").focus(); return;
  }
  return start("ADSKIP_RESOLVE", "tab");
});
node("stop").addEventListener("click", async () => {
  const current = ++generation; const reply = await send("ADSKIP_STOP");
  if (current !== generation) return;
  render(reply.state || { phase: "stopped", message: reply.error || "Đã dừng xử lý.", sourceUrl: currentState?.sourceUrl, steps: [] });
});
node("open").addEventListener("click", async () => { const reply = await send("ADSKIP_OPEN"); if (reply.error) notice(reply.error); });
node("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(Core.urlOf(currentState.url).href); notice("Đã sao chép địa chỉ."); }
  catch { notice("Chưa sao chép được. Mở link và sao chép từ thanh địa chỉ."); }
});
node("auto-open").addEventListener("change", async () => { const reply = await send("ADSKIP_PREFERENCE", { autoOpen: node("auto-open").checked }); if (reply.error) notice(reply.error); });
chrome.storage.onChanged.addListener((changes, area) => {
  const key = source === "input" ? "input" : "tab:" + tabId;
  if (area === "session" && changes[key]?.newValue) render(changes[key].newValue);
  if (area === "local" && changes.autoOpen) node("auto-open").checked = !!changes.autoOpen.newValue;
});
(async () => {
  const initial = generation;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  try { node("current-host").textContent = new URL(tab.url).hostname; } catch { node("current-host").textContent = "Tab đang mở"; }
  // Input jobs do not depend on the current tab and survive closing the popup.
  const reply = await send("ADSKIP_GET", { restore: true, source: Number.isInteger(tabId) ? "tab" : "input" });
  if (initial !== generation) return;
  source = reply.source || "tab"; currentState = null;
  if (reply.inputState?.sourceUrl) node("link-input").value = reply.inputState.sourceUrl;
  render(reply.state || { phase: "error", message: reply.error || "Chưa đọc được trạng thái. Thử lại.", steps: [] });
  node("auto-open").checked = !!reply.preferences?.autoOpen;
})();
