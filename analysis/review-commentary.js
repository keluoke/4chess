import { FairPlayGuard } from '../content/fair-play-guard.js';
import { intuitionTrapFacts } from '../engine/chess-facts.js?v=20261118-local-commentary';
import { BuiltInAi } from './built-in-ai.js?v=20261118-local-commentary';
import { getLang, t } from './i18n.js?v=20261118-local-commentary';

const PREFERENCE = 'diverge_review_commentary';
const FINISHED = new Set(['1-0', '0-1', '1/2-1/2']);
const PROMPT_REVISION = 1;

function wording(facts) {
  const params = {
    played: facts.played.san, elo: facts.maiaRating,
    probability: (facts.playedProbability * 100).toFixed(1),
    points: facts.expectedScoreLossPoints.toFixed(1),
    reply: facts.playedReply?.san, best: facts.best?.san,
    line: facts.bestLine.join(' ')
  };
  const lead = { played: t('commentaryPlayed', params) };
  if (facts.maiaRating && facts.playedProbability !== null) {
    lead.tendency = t('commentaryTendency', params);
    if (facts.playedProbability >= .2) lead.temptation = t('commentaryTemptation', params);
  }
  const detail = { loss: t('commentaryLoss', params) };
  if (facts.best) detail.alternative = t('commentaryAlternative', params);
  if (facts.bestLine.length > 1) detail.line = t('commentaryLine', params);
  if (facts.playedReply) detail.reply = t('commentaryReply', params);
  return { lead, detail };
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
      app.renderBlunderCards();
    };
    this.download.onclick = () => {
      if (this.modelAllowed()) this.model.create({ gesture: true });
    };
    window.addEventListener('pagehide', () => this.suspend());
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      this.sync();
      app.renderCurrentInsight();
    });
    this.renderSettings();
  }

  allowed() {
    return this.toggle.checked && !this.app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress();
  }

  modelAllowed() {
    return this.allowed() && getLang() === 'en';
  }

  sync(options) {
    if (this.modelAllowed()) this.model.probe(options);
    else this.suspend();
    this.renderSettings();
  }

  suspend() {
    this.clearContext();
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

    const choices = wording(facts);
    const key = JSON.stringify([PROMPT_REVISION, getLang(), move.fenBefore, move.uci, review.engineKey, review.modelKey, facts]);
    const cached = this.cache.get(key);
    const fallback = {
      lead: choices.lead.tendency ? 'tendency' : 'played',
      detail: choices.detail.reply ? 'reply' : choices.detail.alternative ? 'alternative' : 'loss'
    };
    this.context = { key, move, facts, choices, review, epoch: this.app.gameEpoch, section, body, source, done: !!cached };
    this.display(this.context, cached ?? fallback, !!cached);
    this.syncModel();
  }

  syncModel() {
    if (this.modelAllowed()) this.model.probe();
    this.maybeGenerate();
  }

  display(context, selected, localAi) {
    context.body.textContent = [context.choices.lead[selected.lead], context.choices.detail[selected.detail]].join(' ');
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
      const leads = Object.keys(context.choices.lead), details = Object.keys(context.choices.detail);
      const schema = {
        type: 'object',
        properties: { lead: { type: 'string', enum: leads }, detail: { type: 'string', enum: details } },
        required: ['lead', 'detail'],
        additionalProperties: false
      };
      const selected = await this.model.choose({ facts: context.facts, allowedSentences: context.choices }, schema, signal);
      if (signal.aborted || !this.isCurrent(context)) return;
      if (!selected || Object.keys(selected).length !== 2 || !leads.includes(selected.lead) || !details.includes(selected.detail)) return;
      this.cache.set(context.key, selected);
      if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
      this.display(context, selected, true);
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
}
