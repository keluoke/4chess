import { FairPlayGuard } from '../content/fair-play-guard.js';
import { intuitionTrapFacts } from '../engine/chess-facts.js?v=20261118-summary-ai';
import { BuiltInAi } from './built-in-ai.js?v=20261118-summary-ai';
import { bindCommentary, COMMENTARY_SCHEMA } from './commentary-text.js?v=20261118-summary-ai';
import { getLang, t } from './i18n.js?v=20261118-summary-ai';

const PREFERENCE = 'diverge_review_commentary';
const FINISHED = new Set(['1-0', '0-1', '1/2-1/2']);
const PROMPT_REVISION = 2;

function wording(facts) {
  const params = {
    played: facts.played.san, elo: facts.maiaRating,
    probability: facts.playedProbability === null ? null : (facts.playedProbability * 100).toFixed(1),
    points: facts.expectedScoreLossPoints.toFixed(1),
    reply: facts.playedReply?.san, best: facts.best?.san,
  };
  const action = move => move && t(move.capture && move.check ? 'commentaryCaptureCheck'
    : move.capture ? 'commentaryCapture' : move.check ? 'commentaryCheck' : 'commentaryMove', {
    san: move.san, square: move.square, piece: move.capture ? t(`commentaryPiece_${move.capture}`) : ''
  });
  const playedAction = action(facts.played);
  const replyAction = action(facts.playedReply);
  const tactical = facts.played.capture || facts.played.check || facts.playedReply?.capture || facts.playedReply?.check;
  const lead = !tactical && facts.maiaRating && params.probability !== null
    ? t('commentaryTendency', params) : t('commentaryExplainPlayed', { action: playedAction });
  const detail = facts.playedReply ? t('commentaryExplainReply', { action: replyAction, points: params.points })
    : facts.best ? t('commentaryAlternative', params) : t('commentaryLoss', params);
  return { fallback: `${lead} ${detail}`, playedAction, replyAction };
}

export class ReviewCommentary {
  cache = new Map();

  constructor(app) {
    this.app = app;
    this.toggle = document.getElementById('setting-review-commentary');
    this.settings = document.getElementById('review-commentary-settings');
    this.status = document.getElementById('review-commentary-status');
    this.download = document.getElementById('review-commentary-download');
    this.progress = document.getElementById('review-commentary-progress');
    this.model = new BuiltInAi(() => this.onModelChange());
    try { this.toggle.checked = localStorage.getItem(PREFERENCE) === 'true'; } catch { /* Optional storage. */ }
    this.toggle.onchange = () => {
      try { localStorage.setItem(PREFERENCE, String(this.toggle.checked)); } catch { /* This tab can still use the feature. */ }
      if (!this.toggle.checked) {
        this.clearContext();
        this.cache.clear();
      }
      this.sync();
      app.renderCurrentInsight();
      app.reviewOverview.render();
    };
    this.download.onclick = () => {
      if (this.modelAllowed()) this.model.create({ gesture: true });
    };
    window.addEventListener('pagehide', () => this.suspend());
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      this.sync();
      app.renderCurrentInsight();
      app.reviewOverview.render();
    });
    this.renderSettings();
  }

  allowed() {
    return !this.app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress();
  }

  modelAllowed() {
    return this.toggle.checked && this.allowed() && getLang() === 'en';
  }

  sync(options) {
    if (!this.toggle.checked || !this.allowed()) this.suspend();
    else if (getLang() !== 'en') {
      this.clearContext();
      this.clearOverview();
    } else this.model.probe(options);
    this.renderSettings();
  }

  suspend() {
    this.clearContext();
    this.clearOverview();
    if (this.model.state !== 'idle') this.model.dispose();
  }

  renderSettings() {
    this.settings.hidden = !this.toggle.checked;
    const state = this.model.state;
    const showModel = this.modelAllowed();
    this.download.hidden = !showModel || !['downloadable', 'downloading', 'failed'].includes(state);
    this.download.textContent = t(state === 'failed' ? 'commentaryRetry' : 'commentaryDownload');
    this.progress.hidden = !showModel || state !== 'starting' || this.model.progress === null;
    if (this.progress.hidden) this.progress.removeAttribute('value');
    else this.progress.value = this.model.progress;

    const status = !this.allowed() ? 'commentaryTemplateOnly' : getLang() !== 'en' ? 'commentaryChinese' : {
      idle: 'commentaryChecking', checking: 'commentaryChecking',
      available: 'commentaryAvailable', downloadable: 'commentaryDownloadable', downloading: 'commentaryDownloading',
      starting: this.progress.hidden ? 'commentaryStarting' : 'commentaryProgress',
      ready: 'commentaryReady', failed: 'commentaryFailed',
      unsupported: this.model.chromeBrand ? 'commentaryChromeUnavailable' : 'commentaryUnavailable',
      unavailable: this.model.chromeBrand ? 'commentaryChromeUnavailable' : 'commentaryUnavailable'
    }[state];
    this.status.textContent = this.toggle.checked ? t(status, { percent: this.model.progress }) : '';
  }

  onModelChange() {
    this.renderSettings();
    this.maybeGenerate();
    this.maybeGenerateOverview();
  }

  eligible(move, review) {
    return !!review && this.allowed() && !review.isPartial && !review.engineOnly &&
      FINISHED.has(this.app.el.metaResult.textContent) && move?.divergenceType === 'intuition_trap' &&
      move.divergenceStatus === 'confirmed' && Number.isFinite(move.verifiedExpectedScoreLoss);
  }

  addCardAction(card, move, review) {
    if (!this.eligible(move, review)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-header review-commentary-action';
    button.textContent = t('commentaryExplain');
    button.onclick = () => {
      this.app.goToPly(move.ply, { before: true, revealCandidates: true });
      const output = document.getElementById('review-commentary');
      output?.scrollIntoView({ block: 'nearest' });
      output?.focus({ preventScroll: true });
    };
    card.append(button);
  }

  render(panel, move, review) {
    this.clearContext();
    if (this.app.isBranching || this.app.practice?.inProgress || !this.eligible(move, review)) return;
    const facts = intuitionTrapFacts(move, review);
    if (!facts) return;

    const section = document.createElement('section');
    section.id = 'review-commentary';
    section.tabIndex = -1;
    section.setAttribute('aria-label', t('commentaryTitle'));
    const heading = document.createElement('h3');
    heading.textContent = t('commentaryTitle');
    const body = document.createElement('p');
    const source = document.createElement('small');
    section.append(heading, body, source);
    panel.append(section);

    const { fallback, playedAction, replyAction } = wording(facts);
    const key = JSON.stringify([PROMPT_REVISION, getLang(), move.fenBefore, move.uci, review.engineKey, review.modelKey, facts]);
    const cached = this.modelAllowed() ? this.cache.get(key) : null;
    const bindings = { played: playedAction, cost: `${facts.expectedScoreLossPoints.toFixed(1)} percentage points of expected score` };
    if (replyAction) bindings.reply = replyAction;
    if (facts.best) bindings.best = facts.best.san;
    if (facts.bestLine.length > 1) bindings.line = facts.bestLine.join(' ');
    if (facts.maiaTop) bindings.maia = facts.maiaTop;
    if (facts.maiaRating && facts.playedProbability !== null) {
      bindings.chance = `a ${(facts.playedProbability * 100).toFixed(1)}% chance of being chosen at ${facts.maiaRating} Elo`;
    }
    const input = {
      task: 'Explain the played move and its drawback. Use [[played]] and [[cost]]. If there is a verified reply, prefer [[reply]]. You may refer to the engine alternative [[best]], its continuation [[line]], or the Maia preference [[maia]] when supplied.',
      turn: facts.turn, facts: bindings
    };
    this.context = { key, move, bindings, input, review, epoch: this.app.gameEpoch, section, body, source, done: !!cached };
    this.display(this.context, cached ?? fallback, !!cached);
    this.syncModel();
  }

  syncModel() {
    if (this.modelAllowed()) this.model.probe();
    this.maybeGenerate();
  }

  display(context, text, localAi) {
    context.body.textContent = text;
    context.source.textContent = t(localAi ? 'commentarySourceAi' : 'commentarySourceFacts');
  }

  isCurrent(context) {
    return this.context === context && context.section.isConnected && this.modelAllowed() &&
      !this.app.isPlaying && !this.app.isBranching && !this.app.practice?.inProgress &&
      this.app.gameEpoch === context.epoch && this.app.currentPly === context.move.ply &&
      this.app.reviewResult === context.review;
  }

  maybeGenerate() {
    const context = this.context;
    if (!context || context.done || this.request || !this.isCurrent(context)) return;
    if (this.model.state === 'available') {
      this.model.create();
      return;
    }
    if (this.model.state !== 'ready') return;
    const controller = this.request = new AbortController();
    this.timer = setTimeout(() => this.generate(context, controller), 160);
  }

  async generate(context, controller) {
    const { signal } = controller;
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      if (signal.aborted || !this.isCurrent(context)) return;
      const draft = await this.model.write(context.input, COMMENTARY_SCHEMA, signal);
      if (signal.aborted || !this.isCurrent(context)) return;
      const text = bindCommentary(draft, context.bindings, ['played', 'cost']);
      if (!text) return;
      this.remember(context.key, text);
      this.display(context, text, true);
    } catch {
      // The deterministic description stays visible for unavailable, interrupted or invalid output.
    } finally {
      clearTimeout(timeout);
      if (this.request === controller) {
        this.request = null;
        context.done = true;
      }
    }
  }

  clearContext() {
    clearTimeout(this.timer);
    this.request?.abort();
    this.request = null;
    this.context?.section.remove();
    this.context = null;
  }

  remember(key, text) {
    this.cache.set(key, text);
    if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
  }

  renderOverview(review, fallback, bindings) {
    const body = document.getElementById('review-report-story');
    const source = document.getElementById('review-report-source');
    const key = JSON.stringify([PROMPT_REVISION, 'overview', fallback, bindings]);
    if (this.overview?.review === review && this.overview.key === key) return;
    this.clearOverview();
    body.textContent = fallback;
    if (!this.modelAllowed() || review.isPartial || !bindings.result) return;
    const context = this.overview = { key, review, epoch: this.app.gameEpoch, body, source, fallback, bindings };
    const cached = this.cache.get(key);
    if (cached) {
      context.done = true;
      this.displayOverview(context, cached);
    } else {
      this.model.probe();
      this.maybeGenerateOverview();
    }
  }

  async maybeGenerateOverview() {
    const context = this.overview;
    if (!context || context.done || this.overviewRequest || !this.modelAllowed() || this.app.practice?.inProgress) return;
    if (this.model.state === 'available') {
      this.model.create();
      return;
    }
    if (this.model.state !== 'ready') return;
    const controller = this.overviewRequest = new AbortController();
    const { signal } = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const draft = await this.model.write({
        task: 'Connect the result, turning point and closing position in one or two sentences. Start with [[result]]. At [[turning]], [[side]] had [[best]] available but played [[played]] instead. These moves are present only when verified. If supplied, [[trigger]] was the previous move and [[closing]] describes the final positions. Write in your own words around these tokens.',
        facts: context.bindings
      }, COMMENTARY_SCHEMA, signal);
      if (signal.aborted || this.overview !== context || this.app.gameEpoch !== context.epoch ||
          this.app.reviewResult !== context.review || !this.modelAllowed() || this.app.practice?.inProgress) return;
      const required = ['result', 'turning', 'played', 'best'].filter(ref => Object.hasOwn(context.bindings, ref));
      const text = bindCommentary(draft, context.bindings, required);
      if (text) {
        this.remember(context.key, text);
        this.displayOverview(context, text);
      }
    } catch {
      // The deterministic recap was already rendered.
    } finally {
      clearTimeout(timeout);
      if (this.overviewRequest === controller) {
        this.overviewRequest = null;
        context.done = true;
      }
    }
  }

  displayOverview(context, text) {
    this.display(context, text, true);
    context.source.hidden = false;
    const studio = document.getElementById('review-studio-summary');
    studio.querySelector('p').textContent = text;
    studio.hidden = false;
  }

  clearOverview() {
    this.cancelOverview();
    if (!this.overview) return;
    this.overview.body.textContent = this.overview.fallback;
    this.overview.source.hidden = true;
    document.getElementById('review-studio-summary').hidden = true;
    this.overview = null;
  }

  cancelOverview() {
    this.overviewRequest?.abort();
    this.overviewRequest = null;
  }
}
