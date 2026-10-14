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
  let nonce = crypto.randomUUID();
  const startUrl = location.href;
  let images = null;
  // Ordinary pages are scanned as static images, never as arbitrary page boards.
  // This permits post/article diagrams without granting unknown chess platforms analysis.
  const interactive =
    'wc-chess-board,cg-board,chess-board,[data-square],[data-piece],.clock-running,.rclock-running,[class*="clock"][class*="running"],button[aria-label*="resign" i],button[title*="resign" i],[data-testid*="resign" i],[data-testid*="draw-offer" i],[class*="chessboard"]:not(img),[class*="chess-board"]:not(img)';
  function surface(image) {
    if (getComputedStyle(image).opacity !== "0") return image;
    // React Native Web renders a visible CSS background plus a transparent accessibility img.
    // Accept only a background paired with the same loaded image, not arbitrary CSS/canvas boards.
    const src = image.currentSrc || image.src;
    const parent = image.parentElement;
    return (
      parent &&
      [parent, ...parent.querySelectorAll('[style*="background-image"]')].find(
        (element) => {
          const background = getComputedStyle(element).backgroundImage;
          const match = /^url\(["']?(.*?)["']?\)$/.exec(background);
          return match && match[1] === src;
        },
      )
    );
  }
  function staticImage(image) {
    if (
      !image.isConnected ||
      !image.complete ||
      image.naturalWidth < 120 ||
      image.naturalHeight < 120
    )
      return false;
    const context =
      image.closest('article,[data-testid="tweet"],figure') ||
      image.parentElement;
    if (
      context?.querySelector(
        'video,iframe,canvas,[aria-live="assertive"],[data-testid*="liveEvent" i]',
      )
    )
      return false;
    // A live broadcast in a social post is not a study diagram.
    if (
      /\blive\s+(?:chess|game|match|broadcast)|\b(?:chess|game|match)\s+(?:is\s+)?(?:live|in\s+progress)\b|正在(?:对局|下棋|比赛)|实时(?:对局|棋局)|直播(?:中|对局|比赛)/i.test(
        context?.textContent || "",
      )
    )
      return false;
    return /^https?:|^data:image\//.test(image.currentSrc || image.src);
  }
  function region(image) {
    const display = surface(image);
    if (!display) return null;
    const r = display.getBoundingClientRect();
    const style = getComputedStyle(display);
    const x = Math.max(0, r.left),
      y = Math.max(0, r.top);
    const right = Math.min(innerWidth, r.right),
      bottom = Math.min(innerHeight, r.bottom);
    if (
      style.visibility === "hidden" ||
      style.display === "none" ||
      Number(style.opacity) === 0 ||
      right - x < 120 ||
      bottom - y < 120
    )
      return null;
    // Do not capture a dialog, embedded board or video covering an image.
    const points = [
      [(x + right) / 2, (y + bottom) / 2],
      [x + 8, y + 8],
      [right - 8, y + 8],
      [x + 8, bottom - 8],
      [right - 8, bottom - 8],
    ];
    if (
      document.elementFromPoint &&
      points.some(([px, py]) => {
        const top = document.elementFromPoint(px, py);
        return (
          !top || (top !== image && top !== display && !top.contains(display))
        );
      })
    )
      return null;
    return {
      x: x / innerWidth,
      y: y / innerHeight,
      width: (right - x) / innerWidth,
      height: (bottom - y) / innerHeight,
    };
  }
  function check(includeRegions = false) {
    if (location.href !== startUrl)
      return { allowed: false, reason: "sourceChanged" };
    if (supported) {
      if (guard.isLiveGameInProgress())
        return { allowed: false, reason: "liveLocked" };
      // On these exact supported domains the existing guard is fail-safe:
      // false already requires an allowed analysis path or positive conclusion evidence.
      return { allowed: true, reason: "" };
    }
    // Preserve the existing static-document path, and add image-only capture on ordinary pages.
    const imageDocument =
      document.contentType.startsWith("image/") &&
      !document.querySelector("iframe");
    const encyclopedia =
      /(^|\.)(wikipedia\.org|wikimedia\.org)$/.test(host) &&
      !!document.querySelector("article,.mw-parser-output") &&
      !document.querySelector(
        'iframe,canvas,video,[class*="clock"],button[aria-label*="resign" i]',
      );
    if (imageDocument || encyclopedia) return { allowed: true, reason: "" };
    if (document.querySelector(interactive))
      return { allowed: false, reason: "liveLocked" };
    if (
      /\/(?:play|game|games|match|live|broadcasts?)(?:\/|$)/i.test(
        location.pathname,
      )
    )
      return { allowed: false, reason: "unsupportedSource" };
    // Unknown embedded/Canvas games cannot be inspected reliably from this document.
    if (
      [...document.querySelectorAll("iframe,canvas")].some((element) => {
        const r = element.getBoundingClientRect();
        return (
          r.width >= 120 &&
          r.height >= 120 &&
          r.bottom > 0 &&
          r.right > 0 &&
          r.top < innerHeight &&
          r.left < innerWidth
        );
      })
    )
      return { allowed: false, reason: "unsupportedSource" };
    if (
      images &&
      images.some(
        ({ image, src, display }) =>
          !staticImage(image) ||
          (image.currentSrc || image.src) !== src ||
          surface(image) !== display,
      )
    )
      return { allowed: false, reason: "sourceChanged" };
    const candidates =
      images ||
      [...document.images]
        .filter((image) => staticImage(image) && region(image))
        .slice(0, 32)
        .map((image) => ({
          image,
          src: image.currentSrc || image.src,
          display: surface(image),
        }));
    if (!candidates.length) return { allowed: false, reason: "noImage" };
    const regions = includeRegions
      ? candidates.map(({ image }) => region(image)).filter(Boolean)
      : undefined;
    if (includeRegions && !regions.length)
      return { allowed: false, reason: "noImage" };
    return { allowed: true, reason: "", imageOnly: true, regions, candidates };
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
    characterData: true,
  });
  const timer = setInterval(broadcast, 75);
  addEventListener("pagehide", () =>
    chrome.runtime
      .sendMessage({ type: "SCAN_REVOKED", nonce, reason: "sourceChanged" })
      .catch(() => {}),
  );
  const listener = (msg, _sender, reply) => {
    if (msg.type === "SCAN_SOURCE_CHECK") {
      if (msg.resetImages) {
        images = null;
        nonce = crypto.randomUUID();
      }
      const gate = check(true);
      if (msg.resetImages) lastAllowed = gate.allowed;
      if (gate.allowed && gate.imageOnly && !images) images = gate.candidates;
      // DOM nodes stay in the source document; only normalized image rectangles leave it.
      delete gate.candidates;
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
    get nonce() {
      return nonce;
    },
    url: startUrl,
    check,
    dispose() {
      observer.disconnect();
      clearInterval(timer);
      chrome.runtime.onMessage.removeListener(listener);
    },
  };
})();
