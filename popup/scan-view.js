import { loadValidatedPosition, validBoardPlacement } from "../scan/position.js";
import { BoardUI } from "../analysis/board-ui.js";
import { CHESS_PIECES_SVG } from "../analysis/chess-pieces.js";
import { ChessBoard } from "../engine/chess-core.js";
import { StockfishInBrowser } from "../engine/stockfish-inbrowser.js";
import { engineLines, whiteEvaluation } from "../analysis/position-analysis.js";
import {
  getPreferences,
  subscribePreferences,
} from "../engine/engine-preferences.js?v=20261123-checkup-account-selection";
import { getUnitSquareToQuadHomography, isAxisAligned } from "../lib/vision/perspective.js";
import { rotateFen, rotateSquare } from "../lib/vision/image-context.js";
import { scanMessages } from "./scan-i18n.js";
const $ = (id) => document.getElementById(id);
const send = (payload) => chrome.runtime.sendMessage(payload);
export function initScanView() {
  let busy = false,
    settingsOpen = false,
    previousFocus = null,
    previousScroll = 0;
  let state = null,
    epoch = 0,
    engine = null,
    original = null,
    editing = false,
    resumeAfterEdit = false,
    recheck = 0,
    saveQueue = Promise.resolve(),
    piece = null,
    capture = null,
    comparisonOrientation = null,
    crop = null,
    start = null,
    lastStatus = "";
  const text = (key) =>
    scanMessages[getPreferences().maia3_lang === "zh" ? "zh" : "en"][key] ||
    key;
  const view = document.createElement("section");
  view.id = "scan-view";
  view.hidden = true;
  view.innerHTML = `<div class="scan-top"><button id="scan-retry" data-scan-text="retry"></button><small id="scan-source"></small></div><p id="scan-status" role="status" aria-live="polite"></p><div id="scan-capture" hidden><p data-scan-text="select"></p><canvas id="scan-preview" aria-label="Screenshot selection"></canvas><div class="scan-row"><button id="scan-detect" data-scan-text="detect"></button><button id="scan-crop" data-scan-text="crop" disabled></button></div></div><div id="scan-position" hidden><div class="scan-direction-row"><select id="scan-turn" aria-label="Side to move"><option value="w" data-scan-text="white"></option><option value="b" data-scan-text="black"></option></select><button id="scan-rotate" data-scan-title="rotateHelp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg><span data-scan-text="rotate"></span></button><button id="scan-flip" data-scan-title="flip"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 3-4 4 4 4M3 7h14v5m0 9 4-4-4-4m4 4H7v-5"/></svg><span data-scan-text="view"></span></button></div><div class="scan-board-wrap"><div class="scan-board-row"><div id="scan-gauge" aria-label="White evaluation"><div id="scan-gauge-white"></div><span id="scan-score"></span></div><div id="scan-board"></div></div><div id="scan-square-popover" class="scan-square-popover" role="dialog" aria-labelledby="scan-popover-title" hidden><div class="scan-popover-head"><span id="scan-popover-title"></span><button type="button" id="scan-popover-close" aria-label="Close">✕</button></div><div id="scan-candidates" aria-label="Model candidates" hidden></div><div id="scan-popover-grid"></div></div></div><div class="scan-toolbar"><button id="scan-undo" data-scan-title="undo"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button><button id="scan-original" data-scan-title="original"><svg viewBox="0 0 24 24"><path d="M5 5v14m14-14-9 7 9 7z"/></svg></button><button id="scan-copy" data-scan-title="copy"><svg viewBox="0 0 24 24"><path d="M9 8h11v13H9zM4 16V3h11"/></svg></button><button id="scan-compare" aria-pressed="false" data-scan-text="compare" hidden></button><button id="scan-edit" data-scan-text="edit"></button></div><div id="scan-editor" hidden><div class="scan-correction"><p data-scan-text="rotateHelp"></p><button id="scan-reselect" data-scan-text="reselect"></button></div><p data-scan-text="palette"></p><div id="scan-palette"></div><label data-scan-text="fen" for="scan-fen"></label><textarea id="scan-fen" rows="2" spellcheck="false"></textarea></div><p id="scan-assumed" data-scan-text="assumed"></p><button id="scan-confirm" class="action-primary" data-scan-text="confirm"></button><div id="scan-results" hidden><p id="scan-engine-status" role="status"></p><div id="scan-lines"></div><button id="scan-web" class="action-primary" data-scan-text="web"></button><p class="scan-help" data-scan-text="help"></p></div></div>`;
  document.querySelector(".popup-header").after(view);
  const launch = document.createElement("button");
  launch.id = "scan-launch";
  launch.className = "action-primary";
  launch.dataset.scanText = "scan";
  document.querySelector(".popup-actions").prepend(launch);
  const gear = document.createElement("button");
  gear.id = "scan-settings";
  gear.className = "scan-icon";
  gear.dataset.scanTitle = "settings";
  gear.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 3h5l.6 2.6 2.2 1.3 2.6-.8 2.5 4.3-2 1.8v2.6l2 1.8-2.5 4.3-2.6-.8-2.2 1.3-.6 2.6h-5l-.6-2.6-2.2-1.3-2.6.8L1.6 16l2-1.8v-2.6l-2-1.8 2.5-4.3 2.6.8 2.2-1.3z" transform="translate(0 -1) scale(1 .95)"/><circle cx="12" cy="12" r="3"/></svg>';
  document.querySelector(".popup-header").append(gear);
  const settings = document.createElement("section");
  settings.id = "popup-settings";
  settings.hidden = true;
  settings.innerHTML =
    '<div class="settings-heading"><button id="scan-settings-back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg><span></span></button><h2 data-scan-text="settings"></h2></div><div class="settings-content"></div>';
  for (const selector of [
    ".popup-preferences",
    ".advanced-settings",
    ".fair-play-note",
    ".popup-footer",
  ])
    settings
      .querySelector(".settings-content")
      .append(document.querySelector(selector));
  document.querySelector(".popup-page").append(settings);
  function openSettings() {
    if (settingsOpen) return;
    settingsOpen = true;
    toggleCompare(false);
    $("scan-settings-back").querySelector("span").textContent = text(
      view.hidden ? "backHome" : "back",
    );
    previousFocus = document.activeElement;
    previousScroll = window.scrollY;
    window.scrollTo(0, 0);
    if (state?.confirmed) ++epoch;
    clearTimeout(recheck);
    engine?.stop();
    view.inert = true;
    settings.hidden = false;
    document.body.classList.add("settings-open");
    settings.querySelector(".settings-content").scrollTop = 0;
    $("scan-settings-back").focus();
  }
  function closeSettings() {
    settingsOpen = false;
    settings.hidden = true;
    view.inert = false;
    document.body.classList.remove("settings-open");
    previousFocus?.focus({ preventScroll: true });
    window.scrollTo(0, previousScroll);
    if (state?.confirmed && !state.locked) analyze();
    else if (resumeAfterEdit && !state?.locked) confirmPosition(true);
  }
  $("scan-settings-back").onclick = closeSettings;
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (settingsOpen) { event.preventDefault(); closeSettings(); }
      else if (!$("scan-square-popover").hidden) { event.preventDefault(); closePopover(); }
    }
  });

  const headerRetry = document.createElement("button");
  headerRetry.className = "scan-icon scan-header-retry";
  headerRetry.dataset.scanTitle = "retry";
  headerRetry.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M5 7a8 8 0 1 1-1 9M5 2v6h6"/></svg>';
  document.querySelector(".popup-header").append(headerRetry);
  headerRetry.onclick = () => scan();
  const board = new BoardUI($("scan-board"), {
    onMove: (_move, fen) => {
      if (!state?.confirmed || state.locked) return;
      state.history.push(state.fen);
      state.fen = fen;
      changed();
    },
  });
  const comparison = document.createElement("canvas");
  comparison.id = "scan-comparison";
  comparison.hidden = true;
  comparison.setAttribute("aria-hidden", "true");
  board.boardEl.append(comparison);
  function locale() {
    document
      .querySelectorAll("[data-scan-text]")
      .forEach((el) => (el.textContent = text(el.dataset.scanText)));
    document.querySelectorAll("[data-scan-title]").forEach((el) => {
      el.title = text(el.dataset.scanTitle);
      el.setAttribute("aria-label", el.title);
    });
    launch.textContent = text("scan");
    $("scan-settings-back").querySelector("span").textContent = text(
      view.hidden ? "backHome" : "back",
    );
    $("scan-edit").textContent = text(editing ? "doneEdit" : "edit");
    $("scan-candidates").setAttribute("aria-label", text("candidates"));
    if (lastStatus) $("scan-status").textContent = statusText(lastStatus);
    if (state?.fen)
      $("scan-source").textContent = text(state.recognition ? "image" : "dom");
  }
  locale();
  subscribePreferences(locale);
  function show() {
    document.body.classList.add("scanning");
    view.hidden = false;
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }
  function status(key) {
    lastStatus = key;
    $("scan-status").textContent = statusText(key);
  }
  function statusText(key) {
    const context = state?.recognitionContext;
    if (key !== "review" || !context) return text(key);
    if (state.directionCorrected) return text("directionCorrected");
    const view = text(
      context.orientation === "black" ? "viewBlack" : "viewWhite",
    );
    const turn = text(state.fen.split(" ")[1] === "b" ? "black" : "white");
    return (
      text(
        context.orientationKnown ? "reviewCoordinates" : "reviewDistribution",
      ).replace("{view}", view) +
      " " +
      text(
        state.turnChosen
          ? "reviewTurnChosen"
          : context.turnConflict
            ? "reviewTurnConflict"
            : context.turnKnown
              ? "reviewTurnKnown"
              : "reviewTurnDefault",
      ).replace("{turn}", turn)
    );
  }
  let popoverSquare = null;
  function closePopover() {
    popoverSquare = null;
    const pop = $("scan-square-popover");
    if (pop) pop.hidden = true;
  }
  function openPopover(square, targetEl) {
    if (!state || state.locked) return;
    popoverSquare = square;
    const pop = $("scan-square-popover");
    $("scan-popover-title").textContent = text("pickPiece").replace("{square}", square);
    const candidates = $("scan-candidates");
    const recognition = state.recognition;
    const recognizedSquare =
      !!state.directionCorrected !== (state.recognitionContext?.orientation !==
        (recognition?.orientation?.perspective === "b" ? "black" : "white"))
        ? rotateSquare(square) : square;
    const choices = recognition?.squares?.find((item) => item.square === recognizedSquare)?.candidates ?? [];
    candidates.replaceChildren(...choices.slice(0, 3).map(({ piece: label, prob }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.piece = label;
      button.innerHTML = CHESS_PIECES_SVG[label] || "×";
      button.title = label === "1" ? text("erase") : label;
      button.setAttribute("aria-label", button.title);
      const confidence = document.createElement("span");
      confidence.textContent = `${Math.round(prob * 100)}%`;
      button.append(confidence);
      button.onclick = () => applySquarePiece(square, label);
      return button;
    }));
    candidates.hidden = !candidates.childElementCount;
    pop.hidden = false;
    const wrap = pop.parentElement.getBoundingClientRect();
    const sqRect = targetEl.getBoundingClientRect();
    const top = sqRect.bottom - wrap.top + 6;
    const maxTop = Math.max(8, wrap.height - pop.offsetHeight - 4);
    pop.style.top = `${Math.min(top, maxTop)}px`;
    const left = Math.max(4, Math.min(wrap.width - pop.offsetWidth - 4, sqRect.left - wrap.left + sqRect.width / 2 - pop.offsetWidth / 2));
    pop.style.left = `${left}px`;
  }
  function clear(keepEngine = false) {
    closePopover();
    toggleCompare(false);
    document.body.classList.remove("scan-confirmed");
    ++epoch;
    clearTimeout(recheck);
    if (keepEngine) engine?.stop();
    else {
      engine?.reset();
      engine = null;
    }
    $("scan-results").hidden = true;
    $("scan-lines").replaceChildren();
    $("scan-score").textContent = "";
    $("scan-gauge-white").style.height = "50%";
    board.clearArrows();
  }
  function lock(key) {
    releaseImages();
    clear();
    board.clearAnnotations(true);
    window.dispatchEvent(new CustomEvent('scan-lock'));
    if (state) {
      state.locked = true;
      state.reason = key;
    }
    $("scan-position").hidden = true;
    $("scan-capture").hidden = true;
    status(scanMessages.en[key] ? key : "error");
  }
  async function valid(id, request, fen) {
    const r = await send({ type: "SCAN_VALIDATE", id, fen }).catch(() => null);
    if (id !== state?.id || request !== epoch || state.locked) return false;
    if (!r?.ok) {
      lock(r?.error || "sourceChanged");
      return false;
    }
    return true;
  }
  function persist(fields = {}) {
    const payload = {
      type: "SCAN_SAVE",
      id: state.id,
      fen: state.fen,
      orientation: board.orientation,
      confirmed: state.confirmed,
      history: [...state.history],
      originalFen: state.originalFen,
      assumed: state.assumed,
      turnChosen: state.turnChosen === true,
      directionCorrected: state.directionCorrected === true,
      reviewedSquares: state.reviewedSquares,
      ...fields,
    };
    const task = saveQueue.then(() => {
      if (state?.id !== payload.id || state.locked) return null;
      return send(payload).catch(() => ({ ok: false, error: "sourceChanged" }));
    });
    saveQueue = task;
    return task;
  }
  async function changed() {
    clear(true);
    const request = epoch;
    $("scan-fen").value = state.fen;
    $("scan-turn").value = state.fen.split(" ")[1];
    board.setPosition(state.fen);
    board.clearArrows();
    const saved = await persist();
    if (request !== epoch) return;
    if (!saved?.ok) return lock(saved?.error || "sourceChanged");
    if (state.confirmed) analyze();
  }
  function previewPosition(fen) {
    if (new ChessBoard().load(fen)) {
      board.setPosition(fen);
      return;
    }
    const rows = fen.split(" ")[0].split("/");
    board.chess.board = Array(64).fill(null);
    rows.slice(0, 8).forEach((rank, r) => {
      let f = 0;
      for (const p of rank) {
        if (/[1-8]/.test(p)) f += Number(p);
        else if (/[rnbqkpRNBQKP]/.test(p) && f < 8) {
          board.chess.board[(7 - r) * 8 + f++] = {
            type: p.toLowerCase(),
            color: p === p.toUpperCase() ? "w" : "b",
          };
        }
      }
    });
    board.chess.turn = fen.split(" ")[1] === "b" ? "b" : "w";
    const fields = fen.split(" ");
    board.chess.castling = Object.fromEntries(
      ["K", "Q", "k", "q"].map((right) => [
        right,
        (fields[2] || "-").includes(right),
      ]),
    );
    board.chess.epSquare =
      fields[3] && fields[3] !== "-"
        ? ChessBoard.squareToIndex(fields[3])
        : null;
    board.chess.halfMoves = Number(fields[4] || 0);
    board.chess.fullMoves = Number(fields[5] || 1);
    board.chess.history = [];
    board.render();
  }
  function showPosition(s) {
    state = s;
    document.body.classList.toggle("scan-confirmed", !!s.confirmed);
    state.history ||= [];
    original = state.originalFen || state.history[0] || state.fen;
    editing = false;
    resumeAfterEdit = false;
    $("scan-capture").hidden = true;
    $("scan-position").hidden = false;
    $("scan-editor").hidden = true;
    $("scan-confirm").hidden = !!s.confirmed;
    $("scan-results").hidden = !s.confirmed;
    $("scan-assumed").hidden = !s.assumed;
    $("scan-source").textContent = text(s.recognition ? "image" : "dom");
    $("scan-turn").value = s.fen.split(" ")[1];
    $("scan-fen").value = s.fen;
    board.setOrientation(s.orientation);
    previewPosition(s.fen);
    $("scan-gauge").classList.toggle("flipped", board.orientation === "black");
    updateSuspicious();
    status(s.confirmed ? "help" : loadValidatedPosition(s.fen) ? "review" : "invalidPosition");
    if (s.confirmed) analyze();
  }
  async function scan({ manual = false } = {}) {
    if (busy) return;
    busy = true;
    show();
    clear();
    state = null;
    board.clearAnnotations(true);
    releaseImages();
    crop = null;
    $("scan-position").hidden = true;
    $("scan-capture").hidden = true;
    status("capturing");
    try {
      const [sourceTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const r = await send({
        type: "SCAN_START",
        tabId: sourceTab?.id,
        windowId: sourceTab?.windowId,
      });
      if (!r?.ok) throw Error(r?.error);
      state = r.state;
      if (r.dataUrl) {
        capture = new Image();
        capture.src = r.dataUrl;
        await capture.decode();
        if (manual) {
          $("scan-capture").hidden = false;
          draw();
          status("select");
        } else await recognize(null, true);
      } else showPosition(r.state);
    } catch (e) {
      lock(e.message);
    } finally {
      busy = false;
    }
  }
  async function recognize(selected, automatic = false) {
    if (busy && !automatic) return;
    busy = true;
    status("recognizing");
    $("scan-capture").hidden = true;
    try {
      const r = await send({
        type: "SCAN_RECOGNIZE",
        id: state.id,
        crop: selected,
      });
      if (state?.locked) return;
      if (r?.ok && r.suggestedCrop) {
        crop = r.suggestedCrop;
        $("scan-capture").hidden = false;
        draw();
        status("adjustCrop");
        return;
      }
      if (!r?.ok || !r.state?.fen || r.state.recognition?.hasBoard === false)
        throw Error(r?.error || "recognitionFailed");
      if (capture && r.boardCrop) prepareComparison(r.boardCrop, r.state.orientation);
      capture = null;
      $("scan-preview").width = 1;
      $("scan-preview").height = 1;
      showPosition(r.state);
    } catch (e) {
      if (state?.locked) return;
      if (e.message?.includes("Screenshot expired")) {
        lock("scanAgain");
        return;
      }
      if (
        capture &&
        ![
          "sourceChanged",
          "liveLocked",
          "unsupportedSource",
          "noImage",
        ].includes(e.message)
      ) {
        $("scan-capture").hidden = false;
        draw();
        status("recognitionFailed");
      } else lock(e.message);
    } finally {
      busy = false;
    }
  }
  async function analyze() {
    const request = ++epoch,
      { id, fen } = state;
    engine?.stop();
    if (
      settingsOpen ||
      !state.confirmed ||
      state.locked
    )
      return;
    await saveQueue;
    if (request !== epoch || !(await valid(id, request, fen))) return;
    document.body.classList.add("scan-confirmed");
    $("scan-results").hidden = false;
    $("scan-confirm").hidden = true;
    $("scan-lines").replaceChildren();
    $("scan-score").textContent = "";
    $("scan-gauge").style.visibility = "hidden";
    if (!board.chess.getLegalMoves().length) {
      $("scan-engine-status").textContent = text("terminal");
      return;
    }
    engine ||= new StockfishInBrowser({ variant: "lite" });
    $("scan-engine-status").textContent = engine.isReady
      ? text("calculating")
      : text("starting");
    const sf = engine;
    try {
      const ready = await sf.initialize();
      if (request !== epoch) return;
      if (!ready) {
        $("scan-engine-status").textContent = text("unavailable");
        return;
      }
      if (!(await valid(id, request, fen))) return;
      $("scan-engine-status").textContent = text("calculating");
      const result = await sf.evaluate(fen, 12, 8000, 3);
      if (request !== epoch) return;
      if (!result) {
        $("scan-engine-status").textContent = text("unavailable");
        return;
      }
      if (!(await valid(id, request, fen))) return;
      $("scan-engine-status").textContent =
        text("finished") + " " + result.depth + " · " + text("perspective");
      $("scan-gauge").style.visibility = "visible";
      const evaluation = whiteEvaluation(result, fen);
      $("scan-score").textContent = evaluation?.text || "";
      $("scan-score").style.top = evaluation?.cp < 0 ? "8px" : "auto";
      $("scan-score").style.bottom = evaluation?.cp < 0 ? "auto" : "8px";
      $("scan-score").style.color = evaluation?.cp < 0 ? "#fff" : "#222";
      $("scan-gauge-white").style.height =
        50 + 45 * Math.tanh((evaluation?.cp || 0) / 500) + "%";
      for (const line of engineLines(result, fen)) {
        const button = document.createElement("button");
        button.className = "scan-line";
        const score = document.createElement("strong"),
          pv = document.createElement("span");
        score.textContent = line.evaluation.text;
        pv.textContent = line.variation.map((m) => m.label).join(" ");
        button.append(score, pv);
        button.title = pv.textContent;
        button.onclick = () => {
          if (state.locked) return;
          const move = board.chess
            .getLegalMoves()
            .find((m) => m.uci === line.uci);
          if (move) board.executeMove(move);
        };
        $("scan-lines").append(button);
      }
    } catch {
      if (request === epoch)
        $("scan-engine-status").textContent = text("unavailable");
    }
  }
  function toggleCompare(show) {
    comparison.hidden = !show || !comparisonOrientation;
    $("scan-compare").setAttribute("aria-pressed", String(!comparison.hidden));
    comparison.classList.toggle("flipped",
      (board.orientation !== comparisonOrientation) !== !!state?.directionCorrected);
  }
  function releaseImages() {
    capture = null;
    start = null;
    comparisonOrientation = null;
    toggleCompare(false);
    comparison.width = comparison.height = 1;
    $("scan-compare").hidden = true;
    $("scan-preview").width = $("scan-preview").height = 1;
  }
  function prepareComparison({ bounds, points }, orientation) {
    const size = 256;
    comparison.width = comparison.height = size;
    const ctx = comparison.getContext("2d");
    const { x, y, width, height } = bounds;
    const w = capture.naturalWidth, h = capture.naturalHeight;
    if (isAxisAligned(points, 0.0005)) {
      ctx.drawImage(capture, x * w, y * h, width * w, height * h, 0, 0, size, size);
    } else {
      const tile = document.createElement("canvas");
      tile.width = tile.height = size;
      const pixels = tile.getContext("2d", { willReadFrequently: true });
      pixels.drawImage(capture, x * w, y * h, width * w, height * h, 0, 0, size, size);
      const original = pixels.getImageData(0, 0, size, size).data;
      const output = ctx.createImageData(size, size);
      const homography = getUnitSquareToQuadHomography(points.map((point) => ({
        x: (point.x - x) / width,
        y: (point.y - y) / height,
      })));
      for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
          const u = (column + 0.5) / size, v = (row + 0.5) / size;
          const denominator = 1 + homography.h20 * u + homography.h21 * v;
          const sx = (homography.h00 * u + homography.h01 * v + homography.h02) / denominator;
          const sy = (homography.h10 * u + homography.h11 * v + homography.h12) / denominator;
          const px = Math.max(0, Math.min(size - 1, Math.floor(sx * size)));
          const py = Math.max(0, Math.min(size - 1, Math.floor(sy * size)));
          const from = (py * size + px) * 4, to = (row * size + column) * 4;
          for (let channel = 0; channel < 4; channel++)
            output.data[to + channel] = original[from + channel];
        }
      }
      ctx.putImageData(output, 0, 0);
    }
    comparisonOrientation = orientation;
    $("scan-compare").hidden = false;
  }
  $("scan-compare").onclick = () => toggleCompare(comparison.hidden);
  function draw() {
    const canvas = $("scan-preview");
    canvas.style.width =
      Math.min(328, (340 * capture.width) / capture.height) + "px";
    canvas.width = 328;
    canvas.height = Math.round((capture.height / capture.width) * 328);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(capture, 0, 0, canvas.width, canvas.height);
    $("scan-crop").disabled = !crop ||
      crop.width * capture.naturalWidth < 32 ||
      crop.height * capture.naturalHeight < 32;
    if (crop) {
      ctx.strokeStyle = "#b13b2e";
      ctx.lineWidth = 3;
      ctx.strokeRect(
        crop.x * canvas.width,
        crop.y * canvas.height,
        crop.width * canvas.width,
        crop.height * canvas.height,
      );
      ctx.fillStyle = ctx.strokeStyle;
      for (const x of [crop.x, crop.x + crop.width]) {
        for (const y of [crop.y, crop.y + crop.height])
          ctx.fillRect(x * canvas.width - 3, y * canvas.height - 3, 6, 6);
      }
    }
  }
  const point = (e) => {
    const r = $("scan-preview").getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  $("scan-preview").onpointerdown = (e) => {
    if (e.button !== 0) return;
    const origin = point(e);
    const canvas = $("scan-preview");
    const rect = canvas.getBoundingClientRect();
    const dx = 10 / rect.width, dy = 10 / rect.height;
    const atLeft = crop && Math.abs(origin.x - crop.x) <= dx;
    const atRight = crop && Math.abs(origin.x - crop.x - crop.width) <= dx;
    const atTop = crop && Math.abs(origin.y - crop.y) <= dy;
    const atBottom = crop && Math.abs(origin.y - crop.y - crop.height) <= dy;
    const inside = crop && origin.x >= crop.x - dx && origin.x <= crop.x + crop.width + dx &&
      origin.y >= crop.y - dy && origin.y <= crop.y + crop.height + dy;
    start = { origin, rect: inside ? crop : null, atLeft, atRight, atTop, atBottom };
    canvas.setPointerCapture(e.pointerId);
  };
  $("scan-preview").onpointermove = (e) => {
    if (!start) return;
    const end = point(e);
    const { origin, rect, atLeft, atRight, atTop, atBottom } = start;
    if (!rect) {
      crop = {
        x: Math.min(origin.x, end.x),
        y: Math.min(origin.y, end.y),
        width: Math.abs(origin.x - end.x),
        height: Math.abs(origin.y - end.y),
      };
    } else {
      const dx = end.x - origin.x, dy = end.y - origin.y;
      const minWidth = Math.min(rect.width, 32 / capture.naturalWidth);
      const minHeight = Math.min(rect.height, 32 / capture.naturalHeight);
      const x2 = rect.x + rect.width, y2 = rect.y + rect.height;
      const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));
      if (atLeft || atRight || atTop || atBottom) {
        const x = atLeft ? clamp(rect.x + dx, 0, x2 - minWidth) : rect.x;
        const y = atTop ? clamp(rect.y + dy, 0, y2 - minHeight) : rect.y;
        const right = atRight && !atLeft ? clamp(x2 + dx, x + minWidth, 1) : x2;
        const bottom = atBottom && !atTop ? clamp(y2 + dy, y + minHeight, 1) : y2;
        crop = { x, y, width: right - x, height: bottom - y };
      } else {
        crop = {
          ...rect,
          x: clamp(rect.x + dx, 0, 1 - rect.width),
          y: clamp(rect.y + dy, 0, 1 - rect.height),
        };
      }
    }
    draw();
  };
  $("scan-preview").onlostpointercapture = () => {
    start = null;
  };
  launch.onclick = scan;
  $("scan-retry").onclick = scan;
  $("scan-detect").onclick = () => recognize(null);
  $("scan-crop").onclick = () => recognize(crop);
  gear.onclick = openSettings;
  $("scan-reselect").onclick = () => scan({ manual: true });
  function updateSuspicious() {
    const pending = new Set();
    if (!state.confirmed) {
      for (const item of state.recognitionContext?.suspiciousSquares || []) {
        const square = typeof item === "string" ? item : item.square;
        const displayed = state.directionCorrected ? rotateSquare(square) : square;
        if (!state.reviewedSquares?.includes(displayed)) pending.add(displayed);
      }
    }
    for (const [square, element] of Object.entries(board.squareEls))
      element.classList.toggle("scan-suspicious", pending.has(square));
  }
  function setEditing(value) {
    editing = value;
    piece = null;
    for (const button of $("scan-palette").children) button.classList.remove("active");
    $("scan-editor").hidden = !editing;
    $("scan-edit").textContent = text(editing ? "doneEdit" : "edit");
    closePopover();
  }
  async function confirmPosition(automatic = false) {
    if (!state || state.locked || state.confirmed) return;
    clearTimeout(recheck);
    const validated = loadValidatedPosition($("scan-fen").value.trim());
    if (!validated) {
      status("invalidPosition");
      return;
    }
    const request = ++epoch;
    if (!(await valid(state.id, request))) return;
    const fen = validated.getFen();
    const originalFen = automatic ? original : fen;
    const saved = await persist({ confirmed: true, fen, originalFen, history: [] });
    if (request !== epoch) return;
    if (!saved?.ok) return lock(saved?.error || "sourceChanged");
    state.fen = fen;
    state.confirmed = true;
    state.history = [];
    state.originalFen = originalFen;
    original = originalFen;
    resumeAfterEdit = false;
    if (!automatic) setEditing(false);
    updateSuspicious();
    board.setPosition(fen);
    $("scan-turn").value = fen.split(" ")[1];
    $("scan-confirm").hidden = true;
    status("help");
    analyze();
  }
  function reviewPosition(fen) {
    resumeAfterEdit ||= state.confirmed;
    clear(true);
    state.confirmed = false;
    state.fen = fen;
    state.history = [];
    $("scan-fen").value = fen;
    $("scan-turn").value = fen.split(" ")[1];
    $("scan-assumed").hidden = !state.assumed;
    $("scan-confirm").hidden = false;
    updateSuspicious();
    const validated = loadValidatedPosition(fen);
    status(validated ? "review" : "invalidPosition");
    const request = epoch;
    persist().then((saved) => {
      if (request === epoch && !saved?.ok) lock(saved?.error || "sourceChanged");
    });
    if (validated && resumeAfterEdit)
      recheck = setTimeout(() => confirmPosition(true), 150);
  }
  $("scan-confirm").onclick = () => confirmPosition();
  $("scan-turn").onchange = () => {
    state.turnChosen = true;
    const fields = state.fen.split(" ");
    fields[1] = $("scan-turn").value;
    fields[3] = "-";
    const fen = fields.join(" ");
    previewPosition(fen);
    reviewPosition(fen);
  };
  $("scan-edit").onclick = () => {
    setEditing(!editing);
    if (!editing && resumeAfterEdit && loadValidatedPosition(state.fen)) {
      clearTimeout(recheck);
      confirmPosition(true);
    }
  };
  function applySquarePiece(square, label) {
    if (!square || !state || state.locked) return;
    const index = ChessBoard.squareToIndex(square);
    const current = board.chess.board[index];
    const next = label === "×" || label === "1" ? null : {
      type: label.toLowerCase(),
      color: label === label.toUpperCase() ? "w" : "b",
    };
    state.reviewedSquares = [...new Set([...(state.reviewedSquares || []), square])];
    if (current?.type === next?.type && current?.color === next?.color) {
      updateSuspicious();
      closePopover();
      persist();
      return;
    }
    board.chess.board[index] = next;
    const [placement, turn] = board.chess.getFen().split(" ");
    const fen = [placement, turn, "-", "-", "0", "1"].join(" ");
    state.assumed = true;
    previewPosition(fen);
    reviewPosition(fen);
  }
  $("scan-popover-close").onclick = closePopover;
  document.addEventListener("pointerdown", (e) => {
    const pop = $("scan-square-popover");
    if (pop && !pop.hidden && !pop.contains(e.target) && !e.target.closest("#scan-board")) {
      closePopover();
    }
  });
  for (const label of [
    "K",
    "Q",
    "R",
    "B",
    "N",
    "P",
    "k",
    "q",
    "r",
    "b",
    "n",
    "p",
    "×",
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = CHESS_PIECES_SVG[label] || "×";
    button.title = label === "×" ? text("erase") : label;
    button.onclick = () => {
      piece = piece === label ? null : label;
      for (const el of $("scan-palette").children)
        el.classList.toggle("active", piece === label && el === button);
    };
    $("scan-palette").append(button);
    const popBtn = document.createElement("button");
    popBtn.type = "button";
    popBtn.innerHTML = CHESS_PIECES_SVG[label] || "×";
    popBtn.title = button.title;
    popBtn.onclick = () => {
      if (popoverSquare) applySquarePiece(popoverSquare, label);
    };
    $("scan-popover-grid").append(popBtn);
  }
  $("scan-board").addEventListener(
    "pointerdown",
    (e) => {
      const sqEl = e.target.closest("[data-square]");
      const square = sqEl?.dataset.square;
      if (!state?.confirmed || editing) {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (editing && square && piece) {
          applySquarePiece(square, piece);
        } else if (square) {
          openPopover(square, sqEl);
        }
      }
    },
    true,
  );
  $("scan-board").addEventListener(
    "click",
    (e) => {
      if (!state?.confirmed || editing) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  $("scan-fen").onchange = () => {
    const fen = $("scan-fen").value.trim();
    if (!validBoardPlacement(fen)) {
      resumeAfterEdit ||= state.confirmed;
      clear(true);
      state.confirmed = false;
      $("scan-confirm").hidden = false;
      persist();
      status("invalidPosition");
      return;
    }
    state.turnChosen = true;
    previewPosition(fen);
    reviewPosition(fen);
  };
  $("scan-flip").onclick = () => {
    board.flip();
    state.orientation = board.orientation;
    toggleCompare(!comparison.hidden);
    $("scan-gauge").classList.toggle("flipped", board.orientation === "black");
    const { id } = state;
    saveQueue.then(() => {
      if (id === state?.id && !state.locked) persist();
    });
  };
  $("scan-rotate").onclick = () => {
    state.confirmed = false;
    resumeAfterEdit = false;
    const fen = rotateFen(state.fen);
    state.directionCorrected = !state.directionCorrected;
    state.reviewedSquares = state.reviewedSquares?.map(rotateSquare);
    previewPosition(fen);
    board.clearAnnotations(true);
    reviewPosition(fen);
  };
  $("scan-undo").onclick = () => {
    if (!state.confirmed || !state.history.length) return;
    state.fen = state.history.pop();
    changed();
  };
  $("scan-original").onclick = () => {
    if (!state.confirmed) return;
    state.fen = original;
    state.history = [];
    changed();
  };
  $("scan-copy").onclick = async () => {
    await navigator.clipboard.writeText(state.fen);
    status("copied");
  };
  $("scan-web").onclick = async () => {
    const request = epoch;
    const { id, fen } = state;
    if (!(await valid(id, request, fen))) return;
    const r = await send({
      type: "SCAN_OPEN",
      id,
      fen: state.fen,
      orientation: board.orientation,
      confirmed: state.confirmed,
      history: state.history,
      originalFen: state.originalFen,
      turnChosen: state.turnChosen,
      directionCorrected: state.directionCorrected,
      reviewedSquares: state.reviewedSquares,
    });
    if (!r.ok && request === epoch) lock(r.error);
  };

  /* LOCAL_FEATURE_START: PUZZLE_POSTER */
  const localTokenLabel = document.createElement('label');
  localTokenLabel.textContent = '本地分享服务令牌（仅保存在此扩展）';
  const localTokenInput = document.createElement('input');
  localTokenInput.type = 'password';
  localTokenInput.autocomplete = 'off';
  localTokenInput.placeholder = '与 .env.local 的 LOCAL_TOKEN 一致';
  localTokenLabel.append(localTokenInput);
  settings.querySelector('.settings-content').append(localTokenLabel);
  chrome.storage.local.get(['miniProgramCodeToken']).then(values => { localTokenInput.value = values.miniProgramCodeToken || ''; });
  localTokenInput.onchange = () => chrome.storage.local.set({ miniProgramCodeToken: localTokenInput.value.trim() });
  import('./puzzle-poster.js')
    .then(({ openPosterModal }) => {
      const posterBtn = document.createElement('button');
      posterBtn.id = 'scan-poster';
      posterBtn.type = 'button';
      posterBtn.textContent = '📸 生成棋谜海报 (含小程序码)';
      posterBtn.onclick = async () => {
        if (!state?.fen) return;
        if (!(await valid(state.id, epoch, state.fen))) return;
        openPosterModal({
          fen: state.fen,
          orientation: board.orientation
        });
      };
      $("scan-web").after(posterBtn);
    })
    .catch(() => {});
  /* LOCAL_FEATURE_END: PUZZLE_POSTER */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === "session" &&
      changes.divergeScan?.newValue?.locked &&
      state?.id === changes.divergeScan.newValue.id
    )
      lock(changes.divergeScan.newValue.reason);
  });
  addEventListener("pagehide", () => {
    releaseImages();
    clear();
  });
  send({ type: "SCAN_RESTORE" })
    .then((r) => {
      if (!busy && !state && r?.ok && r.state?.fen) {
        show();
        showPosition(r.state);
      }
    })
    .catch(() => {});
}
