(function (root) {
  "use strict";
  const Core = root.AdSkipCore; const Ads = root.AdSkipAds;
  const css = `
    :host{display:block;font:14px/1.5 "Segoe UI",Tahoma,sans-serif;color:#172b4d;color-scheme:light;background:#f7fafc}*{box-sizing:border-box}
    .workspace{max-width:1120px;margin:auto;padding:28px 32px 40px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}.brand{display:flex;align-items:baseline;gap:12px}h1{font:600 30px/1.1 Bahnschrift,"Segoe UI",sans-serif;margin:0;letter-spacing:-.6px}.version,.muted,.help{color:#5a687e;font-size:12px}.intro{margin:8px 0 0;color:#5a687e}.close{margin-left:auto}
    nav{display:flex;gap:24px;border-bottom:1px solid #c7d3e2;margin-bottom:26px}nav button{border:0;border-bottom:3px solid transparent;border-radius:0;background:transparent;padding:10px 1px 12px;color:#5a687e;font-size:15px}nav button[aria-selected="true"]{border-color:#2b64c5;color:#172b4d;font-weight:600}
    button,input,textarea,select{font:inherit}button,a{touch-action:manipulation}button{cursor:pointer;min-height:38px;padding:8px 12px;background:#fff;color:#172b4d;border:1px solid #bcc9da;border-radius:6px}button:disabled{opacity:.55;cursor:default}.primary{background:#2b64c5;border-color:#2b64c5;color:#fff}:focus-visible{outline:3px solid #86ade8;outline-offset:3px}button:hover:not(:disabled){filter:brightness(.96)}input,textarea,select{border:1px solid #bcc9da;border-radius:6px;background:#fff;color:#172b4d;padding:9px;max-width:100%}input[type=checkbox]{accent-color:#2b64c5;padding:0;margin:4px 9px 0 0;width:16px;height:16px;flex:none}textarea{width:100%;min-height:230px;resize:vertical;line-height:1.55;font-size:13px}label{display:block;font-weight:600}.help{line-height:1.55;margin:7px 0 14px}.input-label{margin-bottom:8px}h2{font:600 21px/1.35 Bahnschrift,"Segoe UI",sans-serif;margin:0 0 7px}h3{font-size:15px;margin:0 0 9px}
    .batch-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:32px}.controls,.row-actions,.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.controls{margin-top:12px}.toolbar{justify-content:space-between;margin:0 0 16px}.tools{display:flex;gap:8px;flex-wrap:wrap}.progress{font-weight:600;margin:0 0 4px}.queue-message{margin:0 0 12px;color:#5a687e;font-size:13px}.empty{padding:32px 20px;border:1px dashed #bcc9da;color:#5a687e;background:#fff;border-radius:6px;line-height:1.7}.list{display:grid;gap:0}.row{padding:16px 0;border-bottom:1px solid #dbe3ed;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px}.row:first-child{border-top:1px solid #dbe3ed}.source{font-size:13px;font-weight:600;margin:0;overflow-wrap:anywhere}.outcome{display:inline-block;font-size:12px;color:#795018;margin-left:8px;font-weight:400}.resolved .outcome{color:#23765b}.resolving .outcome{color:#2b64c5}.destination{display:block;margin:6px 0 0;overflow-wrap:anywhere;color:#2b64c5;font-size:12px}.row-message{font-size:12px;color:#5a687e;margin:5px 0 0;overflow-wrap:anywhere}.row-actions{align-self:center}.row-actions button{font-size:12px;padding:6px 9px;min-height:34px}.time{display:block;font-size:11px;color:#71819a;margin-top:3px}
    .history-filters{display:flex;gap:10px;flex-wrap:wrap;margin:17px 0}.history-filters input{width:340px}.count{color:#5a687e;font-size:12px}.settings{max-width:640px}.setting-block{padding:22px 0;border-top:1px solid #dbe3ed}.setting-block:first-of-type{border-top:0;padding-top:8px}.check{display:flex;align-items:flex-start;font-weight:400;margin:12px 0 0}.select-setting{display:flex;align-items:center;justify-content:space-between;gap:20px;font-weight:400;margin-top:14px}.select-setting select{min-width:130px}.notice{font-size:13px;color:#23765b;overflow-wrap:anywhere;min-height:1.5em;margin:14px 0 0}.notice.error{color:#9a3d27}.footnote{font-size:12px;color:#5a687e;margin:32px 0 0}a{color:#2b64c5}[hidden]{display:none!important}
    @media(max-width:800px){.workspace{padding:22px 20px 28px}.batch-layout{grid-template-columns:1fr;gap:24px}textarea{min-height:145px}.row{grid-template-columns:1fr}.row-actions{align-self:start}nav{gap:20px}.select-setting{flex-wrap:wrap;gap:8px}.toolbar{align-items:flex-start}}
    @media(max-width:380px){.workspace{padding:18px 14px}nav{gap:16px}nav button{font-size:14px}.brand{gap:8px}h1{font-size:26px}.tools button{font-size:12px}}
  `;
  const html = `
    <div class="workspace">
      <header><div><div class="brand"><h1>AdSkip</h1><span id="version" class="version"></span></div><p class="intro">Xử lý link, giữ kết quả và tiếp tục khi cần.</p></div><button id="close" class="close" type="button" hidden>Đóng</button></header>
      <nav role="tablist" aria-label="Quản lý AdSkip">
        <button id="tab-batch" role="tab" type="button" aria-controls="page-batch" aria-selected="true" data-section="batch">Nhiều link</button>
        <button id="tab-history" role="tab" type="button" aria-controls="page-history" aria-selected="false" data-section="history" tabindex="-1">Lịch sử</button>
        <button id="tab-settings" role="tab" type="button" aria-controls="page-settings" aria-selected="false" data-section="settings" tabindex="-1">Cài đặt</button>
      </nav>
      <section id="page-batch" role="tabpanel" aria-labelledby="tab-batch">
        <div class="batch-layout">
          <form id="batch-form"><label for="batch-input" class="input-label">Danh sách link</label><textarea id="batch-input" maxlength="819200" spellcheck="false" placeholder="https://1shortlink.com/…&#10;https://ez4short.com/…" aria-describedby="batch-help"></textarea><p class="help" id="batch-help">Mỗi dòng một URL HTTPS, tối đa 50 dòng. Link trùng được bỏ qua. Kết quả không tự mở thành tab.</p><div class="controls"><button id="batch-start" class="primary" type="submit">Bắt đầu xử lý</button><button id="batch-stop" type="button" hidden>Dừng hàng đợi</button><button id="batch-resume" type="button" hidden>Chạy tiếp</button></div><p id="queue-scope" class="help"></p></form>
          <div><div class="toolbar"><h2>Kết quả</h2><div class="tools"><button id="batch-copy" type="button" disabled>Sao chép các đích</button><button id="batch-export" type="button" disabled>Xuất JSON</button></div></div><p id="batch-progress" class="progress" role="status" aria-live="polite"></p><p id="batch-message" class="queue-message"></p><div id="batch-list" class="list"></div></div>
        </div>
      </section>
      <section id="page-history" role="tabpanel" aria-labelledby="tab-history" hidden>
        <div class="toolbar"><div><h2>Lịch sử trên máy</h2><p class="help">Lưu nhãn nguồn đã che dữ liệu và URL đích đầy đủ. URL đích có thể chứa chữ ký truy cập hoặc đã hết hạn.</p></div><div class="tools"><button id="history-refresh" type="button">Làm mới</button><button id="history-export" type="button">Xuất lịch sử</button><button id="history-clear" type="button">Xóa toàn bộ lịch sử</button></div></div>
        <div class="history-filters"><input id="history-search" type="search" aria-label="Tìm trong lịch sử" placeholder="Tìm dịch vụ hoặc trang đích"><select id="history-phase" aria-label="Lọc trạng thái"><option value="all">Mọi trạng thái</option><option value="resolved">Đã tìm được đích</option><option value="manual">Cần thao tác</option><option value="error">Có lỗi</option></select></div><p id="history-count" class="count" role="status"></p><div id="history-list" class="list"></div>
      </section>
      <section id="page-settings" role="tabpanel" aria-labelledby="tab-settings" hidden>
        <div class="settings"><h2>Cài đặt AdSkip</h2><form id="settings-form">
          <div class="setting-block"><h3>Xử lý link</h3><label class="check"><input id="setting-auto-open" type="checkbox">Tự mở trang đích khi xử lý từng tab</label><p class="help">Hàng đợi nhiều link và link dán trong popup vẫn dùng nút mở.</p><label class="select-setting" for="setting-delay">Khoảng chờ giữa các link<select id="setting-delay"><option value="500">0,5 giây</option><option value="1000">1 giây</option><option value="2000">2 giây</option></select></label></div>
          <div class="setting-block"><h3>Lịch sử</h3><label class="check"><input id="setting-history" type="checkbox">Lưu lịch sử cục bộ</label><p class="help">Tắt để ngừng ghi kết quả mới; lịch sử đang có được giữ tới khi bạn xóa. Link gốc có query hoặc dữ liệu mã hóa không được lưu trong lịch sử.</p><label class="select-setting" for="setting-limit">Số kết quả giữ lại<select id="setting-limit"><option value="25">25 kết quả</option><option value="100">100 kết quả</option><option value="250">250 kết quả</option></select></label><p class="help">Giảm giới hạn sẽ loại những kết quả cũ vượt giới hạn.</p></div>
          <button id="settings-save" class="primary" type="submit">Lưu cài đặt</button>
        </form><div class="setting-block"><h3 id="ads-title">Quảng cáo theo dịch vụ</h3><p id="ads-help" class="help"></p><div id="ad-settings"></div></div><div class="setting-block"><h3>Cài và cập nhật</h3><p class="help">Extension: thay thư mục bản mới, Reload trong trang quản lý tiện ích và tải lại tab. Tampermonkey: cập nhật script đang có, tránh bật hai bản AdSkip cùng lúc.</p><a href="https://github.com/vankhoa-gubit/Skip-short-link/blob/main/HUONG_DAN_CAI_DAT.md" target="_blank" rel="noopener noreferrer">Hướng dẫn cài đặt</a></div></div>
      </section>
      <p id="notice" class="notice" role="status" aria-live="polite"></p><p class="footnote">AdSkip tìm URL đích; kết quả chưa xác nhận file tải được.</p>
    </div>`;
  function mount(parent, api, options = {}) {
    const host = document.createElement("div"); host.id = "adskip-manager";
    const shadow = host.attachShadow({ mode: "open" }); const style = document.createElement("style"); style.textContent = css;
    const content = document.createElement("div"); content.innerHTML = html; shadow.append(style, content); parent.append(host);
    const node = (id) => shadow.getElementById(id);
    node("version").textContent = Core.VERSION;
    node("queue-scope").textContent = options.userscript ? "Hàng đợi thuộc tab này. Đóng hoặc tải lại tab sẽ dừng hàng đợi; kết quả đã lưu vẫn còn trong Lịch sử." : "Có thể đóng trang quản lý và mở lại. Nếu phiên xử lý bị ngắt, chọn Chạy tiếp để kiểm tra các link chưa xong.";
    node("ads-help").textContent = options.userscript ? "Chỉ ẩn khung quảng cáo đã nhận diện; kết nối mạng vẫn có thể xảy ra. Tùy chọn được lưu riêng cho từng dịch vụ." : "Chặn request và ẩn khung quảng cáo đã nhận diện trên từng dịch vụ. Tải lại trang để nạp lại nội dung đã bị chặn trước khi tắt bộ lọc.";
    let section = "batch"; let batch = { revision: -1, entries: [], phase: "idle" }; let history = []; let dirty = false; let disposed = false; let historyGeneration = 0;
    const announce = (message, error = false) => { node("notice").textContent = message; node("notice").classList.toggle("error", error); };
    const action = async (operation) => { try { return await operation(); } catch (error) { announce(error.message || "Thao tác chưa hoàn tất. Thử lại.", true); return null; } };
    const labels = { queued: "Đang chờ", resolving: "Đang xử lý", resolved: "Đã có đích", manual: "Cần thao tác", error: "Có lỗi", stopped: "Đã dừng" };
    function element(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
    function button(label, callback, disabled = false) { const el = element("button", label); el.type = "button"; el.disabled = disabled; el.addEventListener("click", () => action(async () => { el.disabled = true; try { await callback(); } finally { if (el.isConnected) el.disabled = disabled; } })); return el; }
    function row(entry, historyRow = false) {
      const container = element("article", undefined, "row " + entry.phase); container.dataset.entryId = entry.id;
      const details = element("div"); const source = element("p", entry.sourceLabel, "source"); source.append(element("span", labels[entry.phase] || entry.phase, "outcome")); details.append(source);
      if (historyRow) details.append(element("time", new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(entry.createdAt), "time"));
      if (entry.url) { let text; try { text = Core.describeUrl(entry.url); } catch { text = ""; } if (text) details.append(element("span", text, "destination")); }
      if (entry.message) details.append(element("p", entry.message, "row-message"));
      const actions = element("div", undefined, "row-actions"); const busy = batch.phase === "running";
      if (entry.phase === "resolved") {
        actions.append(button("Mở đích", () => historyRow ? api.openHistory(entry.id) : api.openBatch(entry.id)), button("Sao chép", async () => { await api.copy(Core.urlOf(entry.url).href); announce("Đã sao chép URL đầy đủ."); }));
      } else if (!historyRow && entry.phase === "manual" && entry.url) {
        actions.append(button("Mở bước", () => api.openBatch(entry.id)));
        if (api.continueBatch && Core.canContinue(entry)) actions.append(button("Tiếp tục", async () => renderBatch(await api.continueBatch(entry.id)), busy));
      }
      if (historyRow) actions.append(button("Xóa", async () => { history = await api.removeHistory(entry.id); renderHistory(); }));
      else if (entry.sourceUrl && entry.phase !== "resolving") actions.append(button("Tìm lại", async () => renderBatch(await api.retryBatch(entry.id)), busy));
      container.append(details, actions); return container;
    }
    function renderBatch(next) {
      if (!next || disposed || (next.revision || 0) < (batch.revision || 0)) return;
      batch = next; const busy = next.phase === "running";
      const completed = next.entries.filter(({ phase }) => ["resolved", "manual", "error"].includes(phase)).length;
      node("batch-progress").textContent = next.entries.length ? completed + "/" + next.entries.length + " link đã xử lý" + (next.duplicates ? "; bỏ " + next.duplicates + " link trùng" : "") : "Chưa có hàng đợi";
      node("batch-message").textContent = next.message || "";
      node("batch-start").disabled = busy; node("batch-stop").hidden = !busy;
      node("batch-resume").hidden = !["paused", "stopped"].includes(next.phase) || !next.entries.some((entry) => ["queued", "stopped"].includes(entry.phase) && entry.sourceUrl);
      node("batch-copy").disabled = !next.entries.some(({ phase }) => phase === "resolved"); node("batch-export").disabled = !next.entries.length;
      node("batch-list").replaceChildren(...(next.entries.length ? next.entries.map((entry) => row(entry)) : [element("p", "Dán các link cần kiểm tra, rồi Bắt đầu xử lý. Kết quả từng link sẽ hiện ở đây.", "empty")]));
      if (next.historyWarning) announce(next.historyWarning, true);
    }
    function filteredHistory() {
      const query = node("history-search").value.toLowerCase().trim(); const phase = node("history-phase").value;
      return history.filter((entry) => (phase === "all" || entry.phase === phase) && (!query || (entry.sourceLabel + " " + (entry.url || "")).toLowerCase().includes(query)));
    }
    function renderHistory() {
      if (disposed) return; const visible = filteredHistory();
      node("history-count").textContent = visible.length + "/" + history.length + " kết quả";
      node("history-clear").disabled = !history.length; node("history-export").disabled = !visible.length;
      node("history-list").replaceChildren(...(visible.length ? visible.map((entry) => row(entry, true)) : [element("p", history.length ? "Không có kết quả khớp bộ lọc." : "Chưa có lịch sử. Kết quả sẽ được lưu sau khi xử lý link nếu bật Lưu lịch sử cục bộ.", "empty")]));
    }
    async function refreshHistory() { const current = ++historyGeneration; const records = await api.getHistory(); if (current === historyGeneration && !disposed) { history = records; renderHistory(); } }
    function renderSettings(snapshot) {
      if (!snapshot || disposed) return; const settings = snapshot.settings;
      if (!dirty && settings) { node("setting-auto-open").checked = settings.autoOpen; node("setting-history").checked = settings.saveHistory; node("setting-limit").value = String(settings.historyLimit); node("setting-delay").value = String(settings.batchDelayMs); }
      for (const checkbox of shadow.querySelectorAll("[data-ad-service]")) checkbox.checked = Ads.normalize(snapshot.adFilters)[checkbox.dataset.adService];
      if (snapshot.adFilterError) announce(snapshot.adFilterError, true);
    }
    async function show(next) {
      section = ["batch", "history", "settings"].includes(next) ? next : "batch";
      for (const name of ["batch", "history", "settings"]) { node("page-" + name).hidden = name !== section; node("tab-" + name).setAttribute("aria-selected", String(name === section)); node("tab-" + name).tabIndex = name === section ? 0 : -1; }
      if (section === "history") await action(refreshHistory);
      if (section === "settings") await action(async () => renderSettings(await api.snapshot()));
    }
    for (const tab of shadow.querySelectorAll("[data-section]")) {
      tab.addEventListener("click", () => show(tab.dataset.section));
      tab.addEventListener("keydown", (event) => { const names = ["batch", "history", "settings"]; let index = names.indexOf(section); if (event.key === "ArrowRight") index = (index + 1) % 3; else if (event.key === "ArrowLeft") index = (index + 2) % 3; else if (event.key === "Home") index = 0; else if (event.key === "End") index = 2; else return; event.preventDefault(); node("tab-" + names[index]).focus(); void show(names[index]); });
    }
    for (const service of Ads.services) {
      const label = element("label", undefined, "check"); const checkbox = element("input"); checkbox.type = "checkbox"; checkbox.dataset.adService = service.id; label.append(checkbox, document.createTextNode(service.label));
      checkbox.addEventListener("change", () => action(async () => { const requested = checkbox.checked; checkbox.disabled = true; try { await api.setAdFilter(service.id, requested); announce("Đã lưu tùy chọn quảng cáo."); } catch (error) { checkbox.checked = !requested; throw error; } finally { checkbox.disabled = false; } })); node("ad-settings").append(label);
    }
    node("batch-form").addEventListener("submit", (event) => { event.preventDefault(); void action(async () => { announce(""); renderBatch(await api.startBatch(node("batch-input").value)); }); });
    node("batch-stop").addEventListener("click", () => action(async () => renderBatch(await api.stopBatch())));
    node("batch-resume").addEventListener("click", () => action(async () => renderBatch(await api.resumeBatch())));
    node("batch-copy").addEventListener("click", () => action(async () => { await api.copy(batch.entries.filter(({ phase }) => phase === "resolved").map(({ url }) => Core.urlOf(url).href).join("\n")); announce("Đã sao chép các URL đích đầy đủ."); }));
    function exportJson(entries, kind) {
      const records = entries.map(({ sourceLabel, phase, message, code, url, createdAt }) => ({ sourceLabel, phase, message, code, url: phase === "resolved" ? url : null, createdAt }));
      const blob = new Blob([JSON.stringify({ version: Core.VERSION, exportedAt: new Date().toISOString(), results: records }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const anchor = element("a"); anchor.href = url; anchor.download = "AdSkip-" + kind + ".json"; shadow.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); announce("Đã xuất kết quả; file không chứa link gốc đầy đủ.");
    }
    node("batch-export").addEventListener("click", () => action(async () => exportJson(batch.entries, "results")));
    node("history-export").addEventListener("click", () => action(async () => exportJson(filteredHistory(), "history")));
    node("history-refresh").addEventListener("click", () => action(refreshHistory));
    node("history-clear").addEventListener("click", () => action(async () => { history = await api.clearHistory(); renderHistory(); announce("Đã xóa toàn bộ lịch sử."); }));
    node("history-search").addEventListener("input", renderHistory); node("history-phase").addEventListener("change", renderHistory);
    node("settings-form").addEventListener("input", () => { dirty = true; });
    node("settings-form").addEventListener("submit", (event) => { event.preventDefault(); announce(""); void action(async () => { const save = node("settings-save"); save.disabled = true; try { await api.saveSettings({ autoOpen: node("setting-auto-open").checked, saveHistory: node("setting-history").checked, historyLimit: Number(node("setting-limit").value), batchDelayMs: Number(node("setting-delay").value) }); dirty = false; renderSettings(await api.snapshot()); announce("Đã lưu cài đặt."); } finally { save.disabled = false; } }); });
    if (options.onClose) { node("close").hidden = false; node("close").addEventListener("click", options.onClose); }
    const unsubscribe = api.subscribe?.((change) => {
      if (change.batch) renderBatch(change.batch);
      if (change.history && section === "history") void action(refreshHistory);
      if (change.settings && section === "settings") void action(async () => renderSettings(await api.snapshot()));
      if (change.section) void show(change.section);
    });
    const ready = action(async () => { const snapshot = await api.snapshot(); renderBatch(snapshot.batch); history = snapshot.history || []; renderHistory(); renderSettings(snapshot); await show(options.section || "batch"); });
    return { host, shadow, ready, show, dispose() { disposed = true; unsubscribe?.(); host.remove(); } };
  }
  root.AdSkipWorkspace = { mount };
})(typeof globalThis !== "undefined" ? globalThis : this);
