(function (root) {
  "use strict";
  const Core = root.AdSkipCore;
  const css = `
    :host{all:initial;font-family:"Segoe UI",Tahoma,sans-serif;color:#172b4d;font-size:14px;color-scheme:light}
    *{box-sizing:border-box}button,a,input{font:inherit}button,a{touch-action:manipulation}
    .panel{width:min(368px,calc(100vw - 24px));background:#f7fafc;border:1px solid #c7d3e2;border-radius:12px;box-shadow:0 12px 40px #172b4d26;overflow:hidden}
    header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 18px;background:#e9f0fa;border-bottom:1px solid #c7d3e2}
    .brand{font-family:Bahnschrift,"Segoe UI",sans-serif;font-size:21px;font-weight:600;letter-spacing:-.4px}
    .collapse{border:0;background:transparent;color:#355278;cursor:pointer;padding:6px 9px;border-radius:5px}
    .body{padding:18px}.status{font-weight:600;margin:0 0 8px;display:flex;align-items:center;gap:8px}.dot{width:8px;height:8px;border-radius:50%;background:#5a687e;flex:none}
    .resolved .dot{background:#23765b}.manual .dot,.error .dot{background:#9a5b0b}.resolving .dot{background:#2b64c5}
    .message{margin:0;line-height:1.55;color:#5a687e}.destination{display:block;margin:14px 0 0;padding:10px 12px;background:white;border-left:3px solid #2b64c5;color:#172b4d;overflow-wrap:anywhere;font-size:13px;line-height:1.5;text-decoration:none}
    .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.button{display:inline-flex;align-items:center;justify-content:center;padding:9px 13px;border:1px solid #bcc9da;border-radius:6px;background:white;color:#172b4d;text-decoration:none;cursor:pointer;min-height:38px}
    .primary{background:#2b64c5;border-color:#2b64c5;color:white}.button:disabled{opacity:.55;cursor:wait}.button:hover:not(:disabled){filter:brightness(.96)}
    :focus-visible{outline:3px solid #86ade8;outline-offset:3px}.preferences{display:flex;gap:8px;align-items:flex-start;margin-top:17px;color:#5a687e;font-size:12px;line-height:1.5}.preferences input{margin:3px 0 0;accent-color:#2b64c5}
    details{margin-top:16px;border-top:1px solid #dbe3ed;padding-top:12px;color:#5a687e;font-size:12px}summary{cursor:pointer}.steps{padding:0 0 0 20px;margin:12px 0 0}.steps li{padding:0 0 10px 4px;line-height:1.5}.step-url{display:block;overflow-wrap:anywhere;color:#71819a}
    .toast{font-size:12px;color:#23765b;margin:9px 0 0}.launcher{font-family:Bahnschrift,"Segoe UI",sans-serif;padding:11px 15px;background:#e9f0fa;color:#172b4d;border:1px solid #bcc9da;border-radius:8px;cursor:pointer;box-shadow:0 4px 18px #172b4d20}.hidden{display:none!important}
    @media(prefers-reduced-motion:no-preference){.resolving .dot{animation:pulse 1.3s ease-in-out infinite}@keyframes pulse{50%{opacity:.35}}}
  `;
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function prepareEz4Page() {
    let target;
    try { target = Core.ez4Destination(location.href); } catch { return null; }
    if (!target || !Core.isFileHost(target)) return null;
    window.stop();
    // document-start can stop parsing before an <html> element exists.
    // Build a small local surface so the result remains visible and usable.
    if (!document.documentElement) document.append(document.createElement("html"));
    const html = document.documentElement; html.lang = "vi";
    if (!document.head) html.prepend(document.createElement("head"));
    if (!document.body) html.append(document.createElement("body"));
    document.title = "AdSkip: trang đích đã sẵn sàng";
    const style = element("style", 'body{margin:0;background:#f7fafc;color:#172b4d;font-family:"Segoe UI",sans-serif}main.adskip-ready{margin:56px 24px;max-width:540px}main.adskip-ready h1{font-family:Bahnschrift,"Segoe UI",sans-serif;font-size:28px;font-weight:600;line-height:1.25}main.adskip-ready p{color:#5a687e;line-height:1.6}');
    document.head.append(style);
    const main = element("main", undefined, "adskip-ready");
    main.append(element("h1", "Trang đích đã sẵn sàng"), element("p", "Chọn Mở trang đích trong bảng AdSkip để tiếp tục."));
    document.body.append(main);
    return target;
  }
  function mount(handlers, autoOpen = false) {
    const previous = document.getElementById("adskip-widget");
    if (previous) return null;
    const host = document.createElement("div");
    host.id = "adskip-widget";
    host.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:calc(100vw - 24px)";
    const shadow = host.attachShadow({ mode: "open" });
    const style = element("style", css);
    const panel = element("section", undefined, "panel idle");
    panel.setAttribute("aria-label", "AdSkip: tìm trang đích");
    const header = element("header");
    const brand = element("span", "AdSkip", "brand");
    const collapse = element("button", "Thu gọn", "collapse");
    collapse.type = "button";
    header.append(brand, collapse);
    const body = element("div", undefined, "body");
    const status = element("p", undefined, "status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const dot = element("span", undefined, "dot"); dot.setAttribute("aria-hidden", "true");
    const statusText = element("span", "Sẵn sàng"); status.append(dot, statusText);
    const message = element("p", "Tìm trang đích của link đang mở.", "message");
    const destination = element("a", "", "destination hidden");
    destination.target = "_blank"; destination.rel = "noopener noreferrer";
    const actions = element("div", undefined, "actions");
    const open = element("a", "Mở trang đích", "button primary hidden");
    open.target = "_blank"; open.rel = "noopener noreferrer";
    const copy = element("button", "Sao chép", "button hidden"); copy.type = "button";
    const retry = element("button", "Tìm link", "button"); retry.type = "button";
    const stop = element("button", "Dừng", "button hidden"); stop.type = "button";
    actions.append(open, copy, retry, stop);
    const preference = element("label", undefined, "preferences");
    const checkbox = element("input"); checkbox.type = "checkbox"; checkbox.checked = autoOpen;
    const preferenceText = element("span", "Mở trang đích khi tìm được");
    preference.append(checkbox, preferenceText);
    const details = element("details"); const summary = element("summary", "Các bước đã xử lý");
    const steps = element("ol", undefined, "steps"); details.append(summary, steps);
    const toast = element("p", "", "toast"); toast.setAttribute("role", "status");
    body.append(status, message, destination, actions, preference, details, toast);
    panel.append(header, body);
    const launcher = element("button", "AdSkip", "launcher hidden");
    launcher.type = "button"; launcher.setAttribute("aria-label", "Mở bảng AdSkip");
    shadow.append(style, panel, launcher);
    (document.body || document.documentElement).append(host);
    let state = { phase: "idle", steps: [] };
    let toastTimer;
    collapse.addEventListener("click", () => { panel.classList.add("hidden"); launcher.classList.remove("hidden"); launcher.focus(); });
    launcher.addEventListener("click", () => { panel.classList.remove("hidden"); launcher.classList.add("hidden"); collapse.focus(); });
    retry.addEventListener("click", () => handlers.onStart());
    stop.addEventListener("click", () => handlers.onStop());
    checkbox.addEventListener("change", () => handlers.onPreference(checkbox.checked));
    copy.addEventListener("click", async () => {
      try { await handlers.onCopy(state.url); toast.textContent = "Đã sao chép địa chỉ."; }
      catch { toast.textContent = "Chưa sao chép được. Mở link rồi sao chép từ thanh địa chỉ."; }
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.textContent = ""; }, 3500);
    });
    const labels = { idle: "Sẵn sàng", resolving: "Đang tìm trang đích", resolved: "Đã tìm được trang đích", manual: "Cần thao tác trên trang", error: "Chưa lấy được link", stopped: "Đã dừng" };
    function render(next) {
      state = next;
      const minimized = panel.classList.contains("hidden");
      panel.className = "panel " + (next.phase || "idle") + (minimized ? " hidden" : "");
      statusText.textContent = labels[next.phase] || labels.idle;
      message.textContent = next.message || "Đang đọc dữ liệu trang…";
      let safeUrl = null;
      try { if (next.url && next.phase !== "resolving") safeUrl = Core.urlOf(next.url).href; } catch { /* No unsafe hyperlink. */ }
      destination.classList.toggle("hidden", !safeUrl);
      open.classList.toggle("hidden", !safeUrl);
      copy.classList.toggle("hidden", !safeUrl);
      if (safeUrl) {
        destination.textContent = safeUrl; destination.href = safeUrl; open.href = safeUrl;
        open.textContent = next.phase === "resolved" ? "Mở trang đích" : "Mở bước hiện tại";
      } else { destination.removeAttribute("href"); open.removeAttribute("href"); }
      retry.disabled = next.phase === "resolving";
      retry.textContent = next.phase === "idle" ? "Tìm link" : "Tìm lại";
      stop.classList.toggle("hidden", next.phase !== "resolving");
      steps.replaceChildren();
      for (const step of next.steps || []) {
        const item = element("li", step.label);
        item.append(element("span", step.url, "step-url")); steps.append(item);
      }
    }
    return { render, setPreference(value) { checkbox.checked = !!value; }, host, shadow };
  }
  async function pageHints(signal) {
    if (Core.serviceOf(location.href) !== "1short") return {};
    if (document.readyState === "loading") await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    const candidate = () => document.getElementById("redirect-link")?.getAttribute("data-href");
    let result = candidate();
    if (!result && document.getElementById("redirect-link")) {
      result = await new Promise((resolve) => {
        let timer;
        const finish = (value) => { observer.disconnect(); clearTimeout(timer); signal?.removeEventListener("abort", abort); resolve(value); };
        const observer = new MutationObserver(() => { const value = candidate(); if (value) finish(value); });
        const abort = () => finish(null);
        observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["data-href"], childList: true });
        timer = setTimeout(() => finish(null), 8000);
        if (signal?.aborted) finish(null); else signal?.addEventListener("abort", abort, { once: true });
      });
    }
    return { initialCandidate: result || undefined, initialHtml: document.documentElement.outerHTML.slice(0, 1048576) };
  }
  root.AdSkipPanel = { mount, pageHints, prepareEz4Page };
})(typeof globalThis !== "undefined" ? globalThis : this);
