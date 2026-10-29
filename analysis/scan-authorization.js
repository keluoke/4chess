// Source-bound Scan URLs fail closed when the extension/source is unavailable.
export async function authorizeScan(token, onRevoke) {
  if (!token) return true;
  return new Promise((resolve) => {
    let initial = true,
      revoked = false,
      last = Date.now();
    const lock = () => {
      if (revoked) return;
      revoked = true;
      if (initial) {
        initial = false;
        resolve(false);
      }
      onRevoke();
    };
    window.addEventListener("message", (event) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.type !== "DIVERGE_SCAN_AUTH" ||
        event.data.token !== token
      )
        return;
      last = Date.now();
      if (event.data.allowed !== true) {
        lock();
        return;
      }
      if (initial && !revoked) {
        initial = false;
        resolve(true);
      }
    });
    window.postMessage(
      { type: "DIVERGE_SCAN_AUTH_READ", token },
      location.origin,
    );
    setTimeout(() => {
      if (initial) lock();
    }, 2000);
    setInterval(() => {
      if (!initial && Date.now() - last > 500) lock();
    }, 100);
  });
}
export function showScanLock(app) {
  if (app) {
    app.scanSourceLocked = true;
    app.positionAnalysis?.cancel();
    app.analyzer?.cancel();
    app.intuitionReview?.dispose();
    app.practice?.stop();
    app.stockfish?.reset();
    app.maiaEngine?.dispose();
    app.hasAnalysisInput = false;
    app.gameEpoch++;
    app.boardUI?.clearArrows();
    app.boardUI?.clearAnnotations(true);
    app.resetPositionPanel();
  }
  document.querySelector(".studio-workspace")?.setAttribute("inert", "");
  const main = document.querySelector("main");
  if (main) {
    main.inert = true;
    main.style.visibility = "hidden";
  }
  let note = document.getElementById("scan-source-lock");
  if (!note) {
    note = document.createElement("p");
    note.id = "scan-source-lock";
    note.style.cssText =
      "padding:32px;max-width:600px;margin:auto;line-height:1.8";
    document.body.append(note);
  }
  note.textContent = document.documentElement.lang.startsWith("zh")
    ? "扫描来源已变化、关闭或无法验证。分析已停止，请回到允许的来源页面重新扫描。"
    : "The scan source changed, closed, or could not be verified. Analysis stopped. Scan again from an allowed study page.";
}
