// Injected only after the user clicks Scan (activeTab). Runs in the isolated world.
(async () => {
  if (globalThis.__divergeScanSource?.url === location.href) return;
  globalThis.__divergeScanSource?.dispose();
  const host = location.hostname;
  const supported = /(^|\.)(chess\.com|lichess\.org)$/.test(host);
  let guard, detector;
  if (supported) {
    try {
      const modules = await Promise.all([
        import(chrome.runtime.getURL("content/fair-play-guard.js")),
        import(chrome.runtime.getURL("content/board-detector.js")),
      ]);
      guard = modules[0].FairPlayGuard;
      detector = new modules[1].BoardDetector(() => {});
    } catch {
      return;
    }
  }
  const nonce = crypto.randomUUID();
  const startUrl = location.href;
  function check() {
    if (location.href !== startUrl)
      return { allowed: false, reason: "sourceChanged" };
    if (supported) {
      if (guard.isLiveGameInProgress())
        return { allowed: false, reason: "liveLocked" };
      // On these exact supported domains the existing guard is fail-safe:
      // false already requires an allowed analysis path or positive conclusion evidence.
      return { allowed: true, reason: "" };
    }
    // Explicit static document allow-list. An unknown interactive platform is never assumed safe.
    const imageDocument =
      document.contentType.startsWith("image/") &&
      !document.querySelector("iframe");
    const encyclopedia =
      /(^|\.)(wikipedia\.org|wikimedia\.org)$/.test(host) &&
      !!document.querySelector("article,.mw-parser-output") &&
      !document.querySelector(
        'iframe,canvas,video,[class*="clock"],button[aria-label*="resign" i]',
      );
    return {
      allowed: imageDocument || encyclopedia,
      reason: imageDocument || encyclopedia ? "" : "unsupportedSource",
    };
  }
  let lastAllowed = check().allowed;
  function broadcast() {
    const gate = check();
    if (lastAllowed && !gate.allowed)
      chrome.runtime
        .sendMessage({ type: "SCAN_REVOKED", nonce, reason: gate.reason })
        .catch(() => {});
    lastAllowed = gate.allowed;
  }
  const observer = new MutationObserver(broadcast);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  });
  const timer = setInterval(broadcast, 75);
  addEventListener("pagehide", () =>
    chrome.runtime
      .sendMessage({ type: "SCAN_REVOKED", nonce, reason: "sourceChanged" })
      .catch(() => {}),
  );
  const listener = (msg, _sender, reply) => {
    if (msg.type === "SCAN_SOURCE_CHECK") {
      const gate = check();
      let fen = null,
        orientation = "white",
        assumed = true;
      if (gate.allowed && detector && detector.findBoard()) {
        detector.detectOrientation();
        const replay = detector.getReplayedPositionFromMoves();
        fen = detector.extractFen();
        orientation = detector.orientation;
        assumed = !(replay?.fen && replay.fen === fen);
        if (assumed && fen)
          fen = fen.split(" ").slice(0, 2).join(" ") + " - - 0 1";
      }
      reply({ ...gate, nonce, url: startUrl, fen, orientation, assumed });
    }
    if (msg.type === "SCAN_OVERLAY") {
      const panel = document.getElementById("maia3-intuition-panel");
      if (panel) {
        if (msg.hide) {
          panel.dataset.scanVisibility = panel.style.visibility;
          panel.style.visibility = "hidden";
        } else {
          panel.style.visibility = panel.dataset.scanVisibility || "";
          delete panel.dataset.scanVisibility;
        }
      }
      reply({ ok: true });
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  globalThis.__divergeScanSource = {
    nonce,
    url: startUrl,
    check,
    dispose() {
      observer.disconnect();
      clearInterval(timer);
      chrome.runtime.onMessage.removeListener(listener);
    },
  };
})();
