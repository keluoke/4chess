// Separate, narrowly typed source authorization. The preference bridge stays UI-only.
(() => {
  if (
    location.origin !== "https://4chess.cc" ||
    !/^\/analysis(?:\/|$)/.test(location.pathname)
  )
    return;
  const token = new URLSearchParams(location.hash.slice(1)).get("scan");
  if (!token || !/^[a-f0-9-]{36}$/.test(token)) return;
  let busy = false, requestId = null;
  const publish = (allowed, verifiedRequestId = requestId) =>
    window.postMessage(
      { type: "DIVERGE_SCAN_AUTH", token, allowed, requestId: verifiedRequestId },
      location.origin,
    );
  async function check() {
    if (busy || document.hidden) return;
    busy = true;
    const verifiedRequestId = requestId;
    try {
      const r = await chrome.runtime.sendMessage({
        type: "SCAN_WEB_CHECK",
        token,
      });
      if (r) publish(r.ok === true, verifiedRequestId);
    } catch {
      // A transport failure leaves the check pending. It does not revoke the source.
    } finally {
      busy = false;
      if (verifiedRequestId !== requestId) check();
    }
  }
  window.addEventListener("message", (e) => {
    if (
      e.source === window &&
      e.origin === location.origin &&
      e.data?.type === "DIVERGE_SCAN_AUTH_READ" &&
      e.data.token === token
    ) {
      requestId = Number.isInteger(e.data.requestId) ? e.data.requestId : null;
      check();
    }
  });
  document.addEventListener("visibilitychange", check);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && changes.divergeScan?.newValue?.locked)
      publish(false);
  });
  setInterval(check, 100);
  check();
})();
