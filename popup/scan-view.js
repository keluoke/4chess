import { saneFenFields, validHistoricalFields } from "../scan/position.js";
import { BoardUI } from "../analysis/board-ui.js";
import { CHESS_PIECES_SVG } from "../analysis/chess-pieces.js";
import { ChessBoard } from "../engine/chess-core.js";
import { StockfishInBrowser } from "../engine/stockfish-inbrowser.js";
import { engineLines, whiteEvaluation } from "../analysis/position-analysis.js";
import { validateChessPosition } from "../lib/vision/fen-optimizer.js";
import {
  getPreferences,
  subscribePreferences,
} from "../engine/engine-preferences.js";
import { scanMessages } from "./scan-i18n.js";
const $ = (id) => document.getElementById(id);
const send = (payload) => chrome.runtime.sendMessage(payload);
export function initScanView() {
  let busy = false;
  let state = null,
    epoch = 0,
    engine = null,
    original = null,
    editing = false,
    piece = "P",
    capture = null,
    crop = null,
    start = null,
    lastStatus = "";
  const text = (key) =>
    scanMessages[getPreferences().maia3_lang === "zh" ? "zh" : "en"][key] ||
    key;
  const view = document.createElement("section");
  view.id = "scan-view";
  view.hidden = true;
  view.innerHTML = `<div class="scan-top"><button id="scan-retry" data-scan-text="retry"></button><small id="scan-source"></small></div><p id="scan-status" role="status" aria-live="polite"></p><div id="scan-capture" hidden><p data-scan-text="select"></p><canvas id="scan-preview" aria-label="Screenshot selection"></canvas><div class="scan-row"><button id="scan-detect" data-scan-text="detect"></button><button id="scan-crop" data-scan-text="crop" disabled></button></div></div><div id="scan-position" hidden><div class="scan-row"><select id="scan-turn" aria-label="Side to move"><option value="w" data-scan-text="white"></option><option value="b" data-scan-text="black"></option></select><button id="scan-edit" data-scan-text="edit"></button></div><div class="scan-board-row"><div id="scan-gauge" aria-label="White evaluation"><div id="scan-gauge-white"></div><span id="scan-score"></span></div><div id="scan-board"></div></div><div class="scan-toolbar"><button id="scan-flip" data-scan-title="flip"><svg viewBox="0 0 24 24"><path d="m7 3-4 4 4 4M3 7h14v5m0 9 4-4-4-4m4 4H7v-5"/></svg></button><button id="scan-undo" data-scan-title="undo"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button><button id="scan-original" data-scan-title="original"><svg viewBox="0 0 24 24"><path d="M5 5v14m14-14-9 7 9 7z"/></svg></button><button id="scan-copy" data-scan-title="copy"><svg viewBox="0 0 24 24"><path d="M9 8h11v13H9zM4 16V3h11"/></svg></button><button id="scan-rotate" data-scan-title="rotate"><svg viewBox="0 0 24 24"><path d="M5 7a8 8 0 1 1-1 9M5 2v6h6"/></svg></button></div><div id="scan-editor" hidden><p data-scan-text="palette"></p><div id="scan-palette"></div><label data-scan-text="fen" for="scan-fen"></label><textarea id="scan-fen" rows="2" spellcheck="false"></textarea></div><p id="scan-assumed" data-scan-text="assumed"></p><button id="scan-confirm" class="action-primary" data-scan-text="confirm"></button><div id="scan-results" hidden><p id="scan-engine-status" role="status"></p><div id="scan-lines"></div><button id="scan-web" class="action-primary" data-scan-text="web"></button><p class="scan-help" data-scan-text="help"></p></div></div>`;
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
    '<svg viewBox="0 0 24 24"><path d="m9 3-1 3-3 1 1 4-2 2 2 3 3-1 2 3 3-1 1-3 3-1-1-4 2-2-2-3-3 1-2-3z"/><circle cx="12" cy="12" r="3"/></svg>';
  document.querySelector(".popup-header").append(gear);
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
  function locale() {
    view
      .querySelectorAll("[data-scan-text]")
      .forEach((el) => (el.textContent = text(el.dataset.scanText)));
    document.querySelectorAll("[data-scan-title]").forEach((el) => {
      el.title = text(el.dataset.scanTitle);
      el.setAttribute("aria-label", el.title);
    });
    launch.textContent = view.hidden && state ? text("back") : text("scan");
    if (lastStatus) $("scan-status").textContent = text(lastStatus);
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
    $("scan-status").textContent = text(key);
  }
  function clear() {
    document.body.classList.remove("scan-confirmed");
    ++epoch;
    engine?.reset();
    engine = null;
    $("scan-results").hidden = true;
    $("scan-lines").replaceChildren();
    $("scan-score").textContent = "";
    $("scan-gauge-white").style.height = "50%";
    board.clearArrows();
  }
  function lock(key) {
    clear();
    board.clearAnnotations(true);
    if (state) {
      state.locked = true;
      state.reason = key;
    }
    $("scan-position").hidden = true;
    $("scan-capture").hidden = true;
    status(scanMessages.en[key] ? key : "error");
  }
  async function valid() {
    const r = await send({ type: "SCAN_VALIDATE" });
    if (!r?.ok) {
      lock(r?.error);
      return false;
    }
    return true;
  }
  async function persist() {
    return send({
      type: "SCAN_SAVE",
      id: state.id,
      fen: state.fen,
      orientation: board.orientation,
      confirmed: state.confirmed,
      history: state.history,
      originalFen: state.originalFen,
    });
  }
  async function changed() {
    ++epoch;
    engine?.stop();
    $("scan-fen").value = state.fen;
    $("scan-turn").value = state.fen.split(" ")[1];
    board.setPosition(state.fen);
    board.clearArrows();
    await persist();
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
    for (const square of s.recognition?.suspiciousSquares || []) {
      const el =
        board.squareEls[typeof square === "string" ? square : square.square];
      el?.classList.add("scan-suspicious");
    }
    status(s.confirmed ? "help" : "review");
    if (s.confirmed) analyze();
  }
  async function scan() {
    if (busy) return;
    busy = true;
    show();
    clear();
    state = null;
    board.clearAnnotations(true);
    capture = null;
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
        $("scan-capture").hidden = false;
        draw();
        status("select");
      } else showPosition(r.state);
    } catch (e) {
      lock(e.message);
    } finally {
      busy = false;
    }
  }
  async function recognize(selected) {
    if (busy) return;
    busy = true;
    status("recognizing");
    $("scan-capture").hidden = true;
    try {
      const r = await send({
        type: "SCAN_RECOGNIZE",
        id: state.id,
        crop: selected,
      });
      capture = null;
      if (!r?.ok || !r.state?.fen || r.state.recognition?.hasBoard === false)
        throw Error("recognitionFailed");
      showPosition(r.state);
    } catch (e) {
      if (state?.locked) return;
      lock(e.message);
    } finally {
      busy = false;
    }
  }
  async function analyze() {
    const request = ++epoch,
      fen = state.fen;
    engine?.stop();
    if (
      !state.confirmed ||
      state.locked ||
      !(await valid()) ||
      request !== epoch
    )
      return;
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
      if (!(await valid()) || request !== epoch) return;
      $("scan-engine-status").textContent = text("calculating");
      const result = await sf.evaluate(fen, 12, 8000, 3);
      if (request !== epoch) return;
      if (!result) {
        $("scan-engine-status").textContent = text("unavailable");
        return;
      }
      if (!(await valid()) || request !== epoch) return;
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
  function draw() {
    const canvas = $("scan-preview");
    canvas.style.width =
      Math.min(328, (340 * capture.width) / capture.height) + "px";
    canvas.width = 328;
    canvas.height = Math.round((capture.height / capture.width) * 328);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(capture, 0, 0, canvas.width, canvas.height);
    if (crop) {
      ctx.strokeStyle = "#b13b2e";
      ctx.lineWidth = 3;
      ctx.strokeRect(
        crop.x * canvas.width,
        crop.y * canvas.height,
        crop.width * canvas.width,
        crop.height * canvas.height,
      );
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
    start = point(e);
    $("scan-preview").setPointerCapture(e.pointerId);
  };
  $("scan-preview").onpointermove = (e) => {
    if (!start) return;
    const end = point(e);
    crop = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
    draw();
  };
  $("scan-preview").onpointerup = () => {
    start = null;
    $("scan-crop").disabled = !crop || crop.width < 0.03 || crop.height < 0.03;
  };
  launch.onclick = scan;
  $("scan-retry").onclick = scan;
  $("scan-detect").onclick = () => recognize(null);
  $("scan-crop").onclick = () => recognize(crop);
  gear.onclick = () => {
    if (view.hidden && state) {
      show();
      if (state.locked) lock(state.reason || "sourceChanged");
      else showPosition(state);
    } else {
      clear();
      view.hidden = true;
      document.body.classList.remove("scanning");
      launch.textContent = state ? text("back") : text("scan");
      launch.onclick = state
        ? () => {
            show();
            state.locked ? lock("sourceChanged") : showPosition(state);
          }
        : scan;
      document.querySelector(".popup-preferences").scrollIntoView();
    }
  };
  $("scan-confirm").onclick = async () => {
    const fen = $("scan-fen").value.trim();
    const boardTest = new ChessBoard();
    if (
      !saneFenFields(fen) ||
      !boardTest.load(fen) ||
      !validateChessPosition(fen).valid ||
      !validHistoricalFields(fen, boardTest)
    ) {
      status("invalidPosition");
      return;
    }
    if (!(await valid())) return;
    state.fen = boardTest.getFen();
    state.confirmed = true;
    state.history = [];
    original = state.fen;
    state.originalFen = state.fen;
    editing = false;
    $("scan-editor").hidden = true;
    board.setPosition(state.fen);
    const saved = await persist();
    if (!saved?.ok) {
      lock(saved?.error);
      return;
    }
    status("help");
    analyze();
  };
  $("scan-turn").onchange = () => {
    clear();
    state.confirmed = false;
    state.fen = state.fen.replace(/ [wb] /, " " + $("scan-turn").value + " ");
    $("scan-fen").value = state.fen;
    previewPosition(state.fen);
    $("scan-confirm").hidden = false;
    status("review");
    persist();
  };
  $("scan-edit").onclick = () => {
    clear();
    state.confirmed = false;
    editing = true;
    $("scan-editor").hidden = false;
    $("scan-confirm").hidden = false;
    persist();
    status("review");
  };
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
      piece = label;
      for (const el of $("scan-palette").children)
        el.classList.toggle("active", el === button);
    };
    $("scan-palette").append(button);
  }
  $("scan-board").addEventListener(
    "pointerdown",
    (e) => {
      if (!state?.confirmed || editing) {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (editing) {
          const square = e.target.closest("[data-square]")?.dataset.square;
          if (square) {
            board.chess.board[ChessBoard.squareToIndex(square)] =
              piece === "×"
                ? null
                : {
                    type: piece.toLowerCase(),
                    color: piece === piece.toUpperCase() ? "w" : "b",
                  };
            board.render();
            state.fen = board.chess.getFen();
            $("scan-fen").value = state.fen;
          }
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
    const b = new ChessBoard();
    if (b.load($("scan-fen").value.trim())) {
      state.fen = b.getFen();
      board.setPosition(state.fen);
    } else status("invalidPosition");
  };
  $("scan-flip").onclick = () => {
    board.flip();
    state.orientation = board.orientation;
    $("scan-gauge").classList.toggle("flipped", board.orientation === "black");
    persist();
  };
  $("scan-rotate").onclick = () => {
    clear();
    state.confirmed = false;
    const copy = [...board.chess.board];
    board.chess.board = copy.reverse();
    board.render();
    state.fen = board.chess.getFen();
    $("scan-fen").value = state.fen;
    $("scan-confirm").hidden = false;
    status("review");
    persist();
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
    if (!(await valid())) return;
    const r = await send({
      type: "SCAN_OPEN",
      id: state.id,
      fen: state.fen,
      orientation: board.orientation,
      confirmed: state.confirmed,
      history: state.history,
      originalFen: state.originalFen,
    });
    if (!r.ok) lock(r.error);
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === "session" &&
      changes.divergeScan?.newValue?.locked &&
      state?.id === changes.divergeScan.newValue.id
    )
      lock(changes.divergeScan.newValue.reason);
  });
  addEventListener("pagehide", clear);
  addEventListener("unload", clear);
  send({ type: "SCAN_RESTORE" })
    .then((r) => {
      if (r?.ok && r.state?.fen) {
        show();
        showPosition(r.state);
      }
    })
    .catch(() => {});
}
