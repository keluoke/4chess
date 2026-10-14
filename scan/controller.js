import { validateChessPosition } from "../lib/vision/fen-optimizer.js";
import {
  imageContext,
  saneFenFields,
  validHistoricalFields,
  validBoardPlacement,
} from "./position.js";
import { normalizeEnginePreferences } from "../engine/engine-preferences.js";
import { ChessBoard } from "../engine/chess-core.js";
const KEY = "divergeScan";
const popupSender = (sender) =>
  sender.id === chrome.runtime.id &&
  sender.url === chrome.runtime.getURL("popup/popup.html");
let creating;
let writes = Promise.resolve();
async function offscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creating)
    creating = chrome.offscreen
      .createDocument({
        url: "offscreen/vision.html",
        reasons: ["WORKERS"],
        justification:
          "Decode a user-requested screenshot and recognize a chess diagram locally in a dedicated worker.",
      })
      .finally(() => (creating = null));
  await creating;
}
async function state() {
  return (await chrome.storage.session.get(KEY))[KEY];
}
function save(value, fresh = false) {
  const task = writes.then(async () => {
    const current = await state();
    if (
      !fresh &&
      (current?.id !== value.id || (current.locked && !value.locked))
    )
      throw Error("sourceChanged");
    await chrome.storage.session.set({ [KEY]: value });
    return value;
  });
  writes = task.catch(() => {});
  return task;
}
async function check(source) {
  const tab = await chrome.tabs.get(source.tabId);
  if (tab.url !== source.url) throw Error("sourceChanged");
  const gate = await chrome.tabs.sendMessage(
    source.tabId,
    { type: "SCAN_SOURCE_CHECK" },
    { documentId: source.documentId },
  );
  if (!gate?.allowed || gate.nonce !== source.nonce)
    throw Error(gate?.reason || "sourceChanged");
  return gate;
}
async function revoke(reason, expectedId) {
  const s = await state();
  if (s && s.id === expectedId) {
    await save({ ...s, locked: true, confirmed: false, reason });
    chrome.runtime
      .sendMessage({ type: "VISION_CLEAR", id: s.id })
      .catch(() => {});
  }
}
chrome.tabs.onRemoved.addListener((id) => {
  state().then((s) => {
    if (s?.source.tabId === id) revoke("sourceChanged", s.id);
  });
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === "loading" || change.url)
    state().then((s) => {
      if (s?.source.tabId === id) revoke("sourceChanged", s.id);
    });
});
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "SCAN_REVOKED") {
    state().then((s) => {
      if (
        s?.source.tabId === sender.tab?.id &&
        s.source.documentId === sender.documentId &&
        s.source.nonce === msg.nonce
      )
        revoke(msg.reason, s.id);
    });
    return;
  }
  const isWeb =
    sender.id === chrome.runtime.id &&
    sender.tab &&
    /^https:\/\/4chess\.cc\/analysis(?:\/|[?#]|$)/.test(sender.url || "");
  if (msg.type === "SCAN_WEB_CHECK" && isWeb) {
    (async () => {
      const s = await state();
      if (
        !s ||
        s.locked ||
        !s.confirmed ||
        msg.token !== s.handoff?.token ||
        sender.tab.id !== s.handoff.tabId
      )
        throw Error("sourceChanged");
      await check(s.source);
      reply({ ok: true });
    })().catch((e) => reply({ ok: false, error: e.message }));
    return true;
  }
  if (!msg.type?.startsWith("SCAN_") || !popupSender(sender)) return;
  let expectedId;
  (async () => {
    let s = await state();
    expectedId = s?.id;
    if (msg.type === "SCAN_START") {
      const tab = Number.isInteger(msg.tabId)
        ? await chrome.tabs.get(msg.tabId)
        : (
            await chrome.tabs.query({ active: true, lastFocusedWindow: true })
          )[0];
      if (
        !tab?.id ||
        !tab.active ||
        (Number.isInteger(msg.windowId) && tab.windowId !== msg.windowId) ||
        !/^https?:/.test(tab.url)
      )
        throw Error("unsupportedSource");
      const frames = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/scan-source.js"],
      });
      // Module loading happens asynchronously; wait for readiness, never treat a missing guard as approval.
      let gate;
      for (let n = 0; n < 20; n++) {
        try {
          gate = await chrome.tabs.sendMessage(tab.id, {
            type: "SCAN_SOURCE_CHECK",
            resetImages: true,
          });
          if (gate) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!gate?.allowed) throw Error(gate?.reason || "unsupportedSource");
      const source = {
        tabId: tab.id,
        documentId: frames[0].documentId,
        nonce: gate.nonce,
        url: gate.url,
      };
      s = {
        id: crypto.randomUUID(),
        source,
        fen: gate.fen,
        orientation: gate.orientation,
        assumed: gate.assumed,
        confirmed: false,
        locked: false,
        history: [],
        status: gate.fen ? "review" : "capture",
      };
      expectedId = s.id;
      await save(s, true);
      if (gate.fen) return { ok: true, state: s };
      await offscreen();
      let dataUrl, captureGate;
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "SCAN_OVERLAY",
          hide: true,
        });
        await new Promise((r) => setTimeout(r, 80));
        captureGate = await check(source);
        const [active] = await chrome.tabs.query({
          active: true,
          windowId: tab.windowId,
        });
        if (active?.id !== tab.id) throw Error("sourceChanged");
        dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: "png",
        });
      } finally {
        await chrome.tabs
          .sendMessage(tab.id, { type: "SCAN_OVERLAY", hide: false })
          .catch(() => {});
      }
      const afterCapture = await check(source);
      const [stillActive] = await chrome.tabs.query({
        active: true,
        windowId: tab.windowId,
      });
      if (
        stillActive?.id !== tab.id ||
        JSON.stringify(captureGate.regions) !==
          JSON.stringify(afterCapture.regions)
      )
        throw Error("sourceChanged");
      if ((await state())?.id !== s.id) throw Error("sourceChanged");
      const prepared = await chrome.runtime.sendMessage({
        type: "VISION_CAPTURE",
        id: s.id,
        dataUrl,
        regions: captureGate.imageOnly ? captureGate.regions : undefined,
      });
      if (!prepared?.ok) throw Error(prepared?.error || "recognitionFailed");
      await check(source);
      if ((await state())?.id !== s.id || (await state())?.locked)
        throw Error("sourceChanged");
      dataUrl = prepared.dataUrl || dataUrl;
      return { ok: true, state: s, dataUrl };
    }
    if (!s || s.locked) throw Error(s?.reason || "scanAgain");
    await check(s.source);
    if (msg.type === "SCAN_RESTORE" || msg.type === "SCAN_VALIDATE")
      return { ok: true, state: s };
    if (msg.id !== s.id) throw Error("sourceChanged");
    if (msg.type === "SCAN_RECOGNIZE") {
      const response = await chrome.runtime.sendMessage({
        type: "VISION_RECOGNIZE",
        id: s.id,
        crop: msg.crop,
      });
      if (!response?.ok) throw Error(response?.error || "recognitionFailed");
      await check(s.source);
      const latest = await state();
      if (latest.id !== s.id || latest.locked) throw Error("sourceChanged");
      const result = response.result;
      if (
        !result?.layout?.gridAligned ||
        result.layout.requiresReview ||
        !result.layout.autoAccepted ||
        result.metadata?.isVerifiedManifest !== true
      )
        throw Error("recognitionFailed");
      const context = imageContext(result);
      s = await save({
        ...s,
        status: "review",
        fen: context.fen,
        assumed: true,
        recognition: result,
        recognitionContext: context,
        orientation: context.orientation,
      });
      return { ok: true, state: s };
    }
    if (msg.type === "SCAN_SAVE" || msg.type === "SCAN_OPEN") {
      if (
        typeof msg.fen !== "string" ||
        msg.fen.length > 150 ||
        !saneFenFields(msg.fen) ||
        !validBoardPlacement(msg.fen) ||
        (msg.confirmed === true &&
          (!new ChessBoard().load(msg.fen) ||
            !validateChessPosition(msg.fen).valid ||
            !validHistoricalFields(msg.fen, new ChessBoard(msg.fen))))
      )
        throw Error("invalidPosition");
      const latest = await state();
      if (latest?.id !== s.id || latest.locked) throw Error("sourceChanged");
      s = await save({
        ...latest,
        fen: msg.fen,
        orientation: msg.orientation === "black" ? "black" : "white",
        confirmed: msg.confirmed === true,
        turnChosen: msg.turnChosen === true,
        history: Array.isArray(msg.history)
          ? msg.history
              .filter((f) => typeof f === "string" && f.length < 150)
              .slice(-100)
          : [],
        originalFen:
          typeof msg.originalFen === "string" &&
          new ChessBoard().load(msg.originalFen)
            ? msg.originalFen
            : s.originalFen,
      });
      if (msg.type === "SCAN_SAVE") return { ok: true, state: s };
      if (!s.confirmed) throw Error("confirmPosition");
      await check(s.source);
      const prefs = normalizeEnginePreferences(
        await chrome.storage.local.get(null),
      );
      const raw = await chrome.storage.local.get(["maia3_lang", "defaultElo"]);
      const token = crypto.randomUUID();
      const hash = new URLSearchParams({
        fen: s.fen,
        orientation: s.orientation,
        mode: "position",
        scan: token,
        elo: String(raw.defaultElo || 1900),
      });
      const url = new URL("https://4chess.cc/analysis/");
      url.search = new URLSearchParams({
        sf: prefs.stockfishVariant,
        maia: prefs.maiaVariant,
        lang: raw.maia3_lang === "zh" ? "zh" : "en",
      });
      url.hash = hash;
      // Create unfocused blank tab, bind it before navigating so the studio cannot race authorization.
      const tab = await chrome.tabs.create({
        url: "about:blank",
        active: false,
      });
      const handoffState = await state();
      await check(s.source);
      if (handoffState?.id !== s.id || handoffState.locked) {
        await chrome.tabs.remove(tab.id);
        throw Error("sourceChanged");
      }
      await save({ ...handoffState, handoff: { token, tabId: tab.id } });
      await chrome.tabs.update(tab.id, { url: url.href, active: true });
      return { ok: true };
    }
    throw Error("unsupportedRequest");
  })()
    .then(reply)
    .catch(async (e) => {
      if (
        ["sourceChanged", "liveLocked", "unsupportedSource"].includes(e.message)
      )
        await revoke(e.message, expectedId);
      reply({ ok: false, error: e.message });
    });
  return true;
});
