"use strict";
const Core = globalThis.AdSkipCore;
const node = (id) => document.getElementById(id);
let tabId; let currentState; let noticeTimer;
function notice(text) { node("notice").textContent = text; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { node("notice").textContent = ""; }, 4000); }
function render(state) {
  currentState = state;
  const labels = { idle: "Sẵn sàng", resolving: "Đang tìm trang đích", resolved: "Đã tìm được trang đích", manual: "Cần thao tác trên trang", error: "Chưa lấy được link", stopped: "Đã dừng" };
  node("status").textContent = labels[state.phase] || "Sẵn sàng"; node("message").textContent = state.message || "";
  let url; try { if (state.url && state.phase !== "resolving") url = Core.urlOf(state.url).href; } catch { /* No unsafe links. */ }
  for (const id of ["destination", "open", "copy"]) node(id).classList.toggle("hidden", !url);
  if (url) { node("destination").href = url; node("destination").textContent = url; } else node("destination").removeAttribute("href");
  node("open").textContent = state.phase === "resolved" ? "Mở trang đích" : "Mở bước hiện tại";
  node("resolve").disabled = state.phase === "resolving"; node("stop").classList.toggle("hidden", state.phase !== "resolving");
  node("steps").replaceChildren();
  for (const step of state.steps || []) {
    const item = document.createElement("li"); item.textContent = step.label;
    const urlLabel = document.createElement("span"); urlLabel.className = "step-url"; urlLabel.textContent = step.url; item.append(urlLabel); node("steps").append(item);
  }
}
async function send(type, extra = {}) {
  try { const response = await chrome.runtime.sendMessage({ type, tabId, ...extra }); if (!response) throw new Error("No response"); if (response.error) notice(response.error); return response; }
  catch { const error = "Không kết nối được extension. Đóng rồi mở lại bảng."; notice(error); return { error }; }
}
node("resolve").addEventListener("click", async () => { render({ phase: "resolving", message: "Đang đọc dữ liệu tab…", steps: [] }); const reply = await send("ADSKIP_RESOLVE"); render(reply.state || { phase: "error", message: reply.error || "Chưa đọc được kết quả. Thử lại.", steps: [] }); });
node("stop").addEventListener("click", async () => { const reply = await send("ADSKIP_STOP"); render(reply.state || { phase: "error", message: reply.error || "Chưa dừng được phiên xử lý. Thử lại.", steps: [] }); });
node("open").addEventListener("click", () => send("ADSKIP_OPEN"));
node("copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(Core.urlOf(currentState.url).href); notice("Đã sao chép địa chỉ."); } catch { notice("Chưa sao chép được. Mở link và sao chép từ thanh địa chỉ."); } });
node("auto-open").addEventListener("change", () => send("ADSKIP_PREFERENCE", { autoOpen: node("auto-open").checked }));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes["tab:" + tabId]?.newValue) render(changes["tab:" + tabId].newValue);
  if (area === "local" && changes.autoOpen) node("auto-open").checked = !!changes.autoOpen.newValue;
});
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { render({ phase: "manual", message: "Mở một tab có link để bắt đầu.", steps: [] }); return; }
  tabId = tab.id;
  try { node("current-host").textContent = new URL(tab.url).hostname; } catch { node("current-host").textContent = "Tab đang mở"; }
  const reply = await send("ADSKIP_GET"); render(reply.state || { phase: "error", message: reply.error || "Chưa đọc được trạng thái. Thử lại.", steps: [] });
  node("auto-open").checked = !!reply.preferences?.autoOpen;
})();
