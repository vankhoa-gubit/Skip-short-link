(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.AdSkipAds = factory(root.AdSkipCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  const common = ["googlesyndication.com", "doubleclick.net"];
  const services = [
    { id: "1short", label: "1shortlink", hosts: ["1shortlink.com", "www.1shortlink.com"], domains: [...common, "3nbf4.com", "jhnwr.com", "forfrogadiertor.com"] },
    { id: "ez4short", label: "EZ4Short", hosts: ["ez4short.com", "www.ez4short.com"], domains: common },
    { id: "tech8s", label: "Tech8s", hosts: ["tech8s.net", "www.tech8s.net"], domains: common }
  ];
  function normalize(value) { return Object.fromEntries(services.map(({ id }) => [id, typeof value?.[id] === "boolean" ? value[id] : true])); }
  function rules(service) {
    return [{ id: 1, priority: 1, action: { type: "block" }, condition: {
      initiatorDomains: service.hosts, requestDomains: service.domains,
      resourceTypes: ["script", "image", "xmlhttprequest", "sub_frame", "ping", "media", "other"]
    } }];
  }
  function isAdUrl(value, serviceId) {
    const service = services.find(({ id }) => id === serviceId);
    if (!service) return false;
    let url; try { url = new URL(value, "https://" + service.hosts[0] + "/"); } catch { return false; }
    return ["http:", "https:"].includes(url.protocol) && service.domains.some((domain) => Core.hostIs(url.hostname, domain));
  }
  function mount(document, serviceId, enabled = true, onCount = () => {}) {
    if (!services.some(({ id }) => id === serviceId)) return { setEnabled() {}, dispose() {} };
    const marker = "data-adskip-ad-hidden";
    const marked = new Map();
    let active = false; let observer; let style; let scheduled = false;
    const restore = (node) => {
      const previous = marked.get(node);
      if (previous === null) node.removeAttribute(marker); else node.setAttribute(marker, previous);
      marked.delete(node);
    };
    const scan = () => {
      if (!active) return;
      const wanted = new Set([...document.querySelectorAll("iframe[src],img[src],ins.adsbygoogle")].filter((node) =>
        node.matches("ins.adsbygoogle") || isAdUrl(node.getAttribute("src"), serviceId)));
      for (const node of marked.keys()) if (!wanted.has(node)) restore(node);
      for (const node of wanted) if (!marked.has(node)) {
        marked.set(node, node.getAttribute(marker)); node.setAttribute(marker, "true");
      }
      onCount(marked.size);
    };
    const schedule = () => {
      if (scheduled) return; scheduled = true;
      queueMicrotask(() => { scheduled = false; scan(); });
    };
    function setEnabled(value) {
      if (!!value === active) return;
      active = !!value;
      if (active) {
        style = document.createElement("style");
        style.textContent = '[' + marker + '="true"]{display:none!important}';
        (document.head || document.documentElement).append(style);
        observer = new MutationObserver(schedule);
        observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "class"] });
        scan();
      } else {
        observer?.disconnect(); style?.remove();
        for (const node of marked.keys()) restore(node);
        onCount(0);
      }
    }
    setEnabled(enabled);
    return { setEnabled, dispose() { setEnabled(false); } };
  }
  return { services, normalize, rules, isAdUrl, mount };
});
