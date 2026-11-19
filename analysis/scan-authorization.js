// Source-bound Scan URLs fail closed when the extension/source is unavailable.
export async function authorizeScan(token, onRevoke, onAvailability) {
  if (!token) return true;
  return new Promise((resolve) => {
    let started = false, available = false, last = 0, deadline = 0;
    let requestId = 0, supportsRequestId = false;
    const lock = () => {
      clearInterval(watchdog);
      window.removeEventListener("message", receive);
      document.removeEventListener("visibilitychange", recheck);
      if (!started) resolve(false);
      onRevoke();
    };
    const recheck = () => {
      if (available) {
        available = false;
        onAvailability(false);
      }
      if (document.hidden) return;
      deadline = performance.now() + 2000;
      window.postMessage(
        { type: "DIVERGE_SCAN_AUTH_READ", token, requestId: ++requestId },
        location.origin,
      );
    };
    const receive = (event) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.type !== "DIVERGE_SCAN_AUTH" ||
        event.data.token !== token
      )
        return;
      if (event.data.allowed !== true) {
        lock();
        return;
      }
      // Older installed bridges do not echo request IDs. Updated bridges must
      // confirm the current check before the board becomes interactive again.
      supportsRequestId ||= Object.hasOwn(event.data, "requestId");
      if (document.hidden || (supportsRequestId && event.data.requestId !== requestId)) return;
      last = performance.now();
      if (available) return;
      available = true;
      if (!started) {
        started = true;
        resolve(true);
      } else onAvailability(true);
    };
    window.addEventListener("message", receive);
    document.addEventListener("visibilitychange", recheck);
    const watchdog = setInterval(() => {
      // Hidden renderers may batch timers or freeze entirely. Recheck when
      // visible, while keeping a real denial final even in the background.
      if (document.hidden) return;
      const now = performance.now();
      if (available && now - last > 500) recheck();
      else if (!available && now > deadline) lock();
    }, 100);
    recheck();
  });
}

function setWorkspaceAvailable(available) {
  const main = document.querySelector("main");
  if (!main) return;
  main.inert = !available;
  main.style.visibility = available ? "" : "hidden";
}

export function setScanAvailability(app, available) {
  if (!app) return;
  app.scanSourceLocked = !available;
  app.reviewOverview?.show(available ? app.reviewOverview.view : 'workbench');
  setWorkspaceAvailable(available);
  if (available) {
    app.mistakeBank?.refreshState?.();
    app.checkup?.syncVisibility?.();
    app.intuitionReview.render();
    app.updateActivePositionAnalysis();
    app.scheduleReviewResume();
  } else {
    app.mistakeBank?.close?.();
    app.mistakeBank?.refreshState?.();
    app.checkup?.close?.();
    app.checkup?.syncVisibility?.();
    app.shareCard?.close?.();
    app.consequencePlayer?.stop?.();
    app.reviewCommentary?.suspend();
    if (app.isPlaying) app.toggleAutoPlay();
    app.boardUI.cancelGesture();
    app.boardUI.closePromotion();
    app.positionAnalysis.cancel();
    app.pauseWholeReview();
    if (app.intuitionReview.state === 'running') app.intuitionReview.pause();
    if (app.practice?.busy) app.stockfish.stop();
  }
}

export function showScanLock(app) {
  if (app) {
    app.scanSourceLocked = true;
    app.mistakeBank?.close?.();
    app.mistakeBank?.refreshState?.();
    app.checkup?.close?.();
    app.checkup?.syncVisibility?.();
    app.shareCard?.close?.();
    app.consequencePlayer?.stop?.();
    app.reviewCommentary?.suspend();
    app.reviewOverview?.show('workbench');
    if (app.isPlaying) app.toggleAutoPlay();
    app.positionAnalysis?.cancel();
    app.analyzer?.cancel();
    app.intuitionReview?.dispose();
    app.practice?.stop();
    app.stockfish?.reset();
    app.maiaEngine?.dispose();
    app.hasAnalysisInput = false;
    app.gameEpoch++;
    app.boardUI?.cancelGesture();
    app.boardUI?.closePromotion();
    app.boardUI?.clearArrows();
    app.boardUI?.clearAnnotations(true);
    app.resetPositionPanel();
  }
  const bankDialog = document.getElementById('mistake-bank-dialog');
  if (bankDialog?.open) bankDialog.close();
  const bankButton = document.getElementById('btn-mistake-bank');
  if (bankButton) bankButton.hidden = true;
  const checkupDialog = document.getElementById('checkup-dialog');
  if (checkupDialog?.open) checkupDialog.close();
  const checkupButton = document.getElementById('btn-intuition-checkup');
  if (checkupButton) checkupButton.hidden = true;
  const shareDialog = document.getElementById('share-card-dialog');
  if (shareDialog?.open) shareDialog.close();
  document.querySelector(".studio-workspace")?.setAttribute("inert", "");
  setWorkspaceAvailable(false);
  document.getElementById("engine-candidate-lines")?.replaceChildren();
  document.getElementById("maia-candidate-lines")?.replaceChildren();
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
