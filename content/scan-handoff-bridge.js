// Separate, narrowly typed source authorization. The preference bridge stays UI-only.
(() => {
  if (
    location.origin !== "https://4chess.cc" ||
    !/^\/analysis(?:\/|$)/.test(location.pathname)
  )
    return;
  const token = new URLSearchParams(location.hash.slice(1)).get("scan");
  if (!token || !/^[a-f0-9-]{36}$/.test(token)) return;
  let busy = false;
  const publish = (allowed) =>
    window.postMessage(
      { type: "DIVERGE_SCAN_AUTH", token, allowed },
      location.origin,
    );
  async function check() {
    if (busy) return;
    busy = true;
    try {
      const r = await chrome.runtime.sendMessage({
        type: "SCAN_WEB_CHECK",
        token,
      });
      publish(r?.ok === true);
    } catch {
      publish(false);
    } finally {
      busy = false;
    }
  }
  window.addEventListener("message", (e) => {
    if (
      e.source === window &&
      e.origin === location.origin &&
      e.data?.type === "DIVERGE_SCAN_AUTH_READ" &&
      e.data.token === token
    )
      check();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && changes.divergeScan?.newValue?.locked)
      publish(false);
  });
  setInterval(check, 100);
  check();
})();
