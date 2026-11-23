import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import {
  ACTIVE_PROFILE_KEY,
  DEFAULT_PROFILE_ID,
  StudyStore,
  buildTrapRecord,
  parseAliases,
  resolvePerspective,
  trapId
} from './study-store.js?v=20261123-challenge-choice';
import { t } from './i18n.js?v=20261123-challenge-choice';

export class MistakeBank {
  filter = 'due';
  phase = 'all';
  sort = 'due';
  openGeneration = 0;
  refreshGeneration = 0;
  savedIds = new Set();
  profiles = [];
  activeProfile = null;

  constructor(app, store = new StudyStore()) {
    this.app = app;
    this.store = store;
    this.supported = typeof location === 'undefined' || location.protocol !== 'chrome-extension:';
    this.button = document.getElementById('btn-mistake-bank');
    this.badge = document.getElementById('mistake-bank-due-badge');
    this.dialog = document.getElementById('mistake-bank-dialog');
    this.closeBtn = document.getElementById('btn-close-mistake-bank');
    this.profileSelect = document.getElementById('bank-profile-select');
    this.btnNewProfile = document.getElementById('btn-bank-new-profile');
    this.btnEditProfile = document.getElementById('btn-bank-edit-profile');
    this.btnDeleteProfile = document.getElementById('btn-bank-delete-profile');
    this.profileForm = document.getElementById('bank-profile-form');
    this.profileNameInput = document.getElementById('bank-profile-name');
    this.profileAliasesInput = document.getElementById('bank-profile-aliases');
    this.btnCancelProfile = document.getElementById('btn-bank-profile-cancel');
    this.btnPractice = document.getElementById('btn-bank-practice');
    this.btnExport = document.getElementById('btn-bank-export');
    this.btnImport = document.getElementById('btn-bank-import');
    this.importInput = document.getElementById('bank-import-file');
    this.phaseSelect = document.getElementById('bank-phase-filter');
    this.sortSelect = document.getElementById('bank-sort-filter');
    this.statsEl = document.getElementById('bank-stats-bar');
    this.statusEl = document.getElementById('bank-status-note');
    this.listEl = document.getElementById('bank-trap-list');
    this.filterButtons = [...document.querySelectorAll('#mistake-bank-dialog [data-bank-filter]')];

    if (!this.supported) {
      if (this.button) this.button.hidden = true;
      return;
    }

    this.bindEvents();
    this.ready = this.refreshState();
    window.addEventListener('storage', event => {
      if (event.key === ACTIVE_PROFILE_KEY) this.refreshState().catch(console.warn);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.refreshState().catch(console.warn);
    });
  }

  allowed() {
    return this.supported && !this.app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress();
  }

  bindEvents() {
    if (this.button) {
      this.button.hidden = false;
      this.button.onclick = () => this.open();
    }
    if (this.closeBtn) this.closeBtn.onclick = () => this.close();
    if (this.dialog) {
      this.dialog.addEventListener('click', event => {
        if (event.target === this.dialog) {
          const rect = this.dialog.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            this.close();
          }
        }
      });
      this.dialog.addEventListener('close', () => this.button?.focus({ preventScroll: true }));
    }
    if (this.profileSelect) {
      this.profileSelect.onchange = () => this.selectProfile(this.profileSelect.value);
    }
    if (this.btnNewProfile) {
      this.btnNewProfile.onclick = () => this.openProfileEditor(null);
    }
    if (this.btnEditProfile) {
      this.btnEditProfile.onclick = () => this.openProfileEditor(this.activeProfile);
    }
    if (this.btnDeleteProfile) {
      this.btnDeleteProfile.onclick = async () => {
        if (!this.activeProfile || this.activeProfile.id === DEFAULT_PROFILE_ID) return;
        await this.store.deleteProfile(this.activeProfile.id);
        await this.refreshState();
        await this.renderDialog();
        this.app.renderBlunderCards?.();
        this.app.reviewOverview?.render?.();
      };
    }
    if (this.btnCancelProfile) {
      this.btnCancelProfile.onclick = () => {
        if (this.profileForm) this.profileForm.hidden = true;
      };
    }
    if (this.profileForm) {
      this.profileForm.onsubmit = async event => {
        event.preventDefault();
        const displayName = this.profileNameInput?.value?.trim();
        if (!displayName) return;
        const saved = await this.store.saveProfile({
          id: this.editingProfileId || undefined,
          displayName,
          aliases: parseAliases(this.profileAliasesInput?.value || '')
        });
        this.store.setActiveProfileId(saved.id);
        this.profileForm.hidden = true;
        this.editingProfileId = null;
        await this.refreshState();
        await this.renderDialog();
        this.app.renderBlunderCards?.();
        this.app.reviewOverview?.render?.();
      };
    }
    for (const btn of this.filterButtons) {
      btn.onclick = () => {
        this.filter = btn.dataset.bankFilter || 'due';
        this.renderDialog();
      };
    }
    if (this.phaseSelect) {
      this.phaseSelect.onchange = () => {
        this.phase = this.phaseSelect.value || 'all';
        this.renderDialog();
      };
    }
    if (this.sortSelect) {
      this.sortSelect.onchange = () => {
        this.sort = this.sortSelect.value || 'due';
        this.renderDialog();
      };
    }
    if (this.btnPractice) {
      this.btnPractice.onclick = () => this.startDailyPractice();
    }
    if (this.btnExport) {
      this.btnExport.onclick = () => this.exportJson();
    }
    if (this.btnImport && this.importInput) {
      this.btnImport.onclick = () => this.importInput.click();
      this.importInput.onchange = async event => {
        const file = event.target.files?.[0];
        this.importInput.value = '';
        if (!file) return;
        try {
          const payload = JSON.parse(await file.text());
          const summary = await this.store.importBackup(payload);
          await this.refreshState();
          await this.renderDialog();
          this.app.showToast?.(t('bankImportDone', summary));
        } catch {
          this.app.showToast?.(t('bankImportError'));
        }
      };
    }
  }

  openProfileEditor(profile) {
    if (!this.profileForm) return;
    this.editingProfileId = profile?.id || null;
    if (this.profileNameInput) this.profileNameInput.value = profile?.displayName || '';
    if (this.profileAliasesInput) this.profileAliasesInput.value = (profile?.aliases || []).join(', ');
    this.profileForm.hidden = false;
    this.profileNameInput?.focus();
  }

  async refreshState() {
    if (!this.supported) return;
    const generation = ++this.refreshGeneration;
    await this.store.init();
    const [profiles, profile] = await Promise.all([this.store.listProfiles(), this.store.getActiveProfile()]);
    const traps = await this.store.listTraps(profile.id, { filter: 'all' });
    if (generation !== this.refreshGeneration || profile.id !== this.store.getActiveProfileId()) return;
    const previousId = this.activeProfile?.id;
    this.profiles = profiles;
    this.activeProfile = profile;
    this.savedIds = new Set(traps.map(item => item.id));
    const due = traps.filter(item => (item.srs?.nextReviewAt ?? 0) <= Date.now()).length;
    if (this.badge) {
      this.badge.textContent = String(due);
      this.badge.hidden = due === 0;
    }
    if (this.button) {
      this.button.hidden = !this.allowed();
    }
    this.app.studyProfilesChanged?.(previousId);
  }

  async selectProfile(id) {
    this.store.setActiveProfileId(id);
    await this.refreshState();
    if (this.dialog?.open) await this.renderDialog();
    this.app.renderBlunderCards?.();
    this.app.reviewOverview?.render?.();
  }

  async updateProfileAccount(id, platform, username, options) {
    const saved = await this.store.setProfileAccount(id, platform, username, options);
    if (!saved) throw new Error('Profile does not exist');
    await this.refreshState();
    if (!options?.remove) this.app.checkupReminders?.offerAfterLink(saved);
    this.app.renderBlunderCards?.();
    this.app.reviewOverview?.render?.();
  }

  profileLabel(profile) {
    return profile.id === DEFAULT_PROFILE_ID && profile.displayName === 'Default' ? t('bankDefaultProfile') : profile.displayName;
  }

  renderProfileOptions(select) {
    if (!select) return;
    select.replaceChildren();
    for (const profile of this.profiles) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = this.profileLabel(profile);
      option.selected = profile.id === this.activeProfile?.id;
      select.add(option);
    }
  }

  renderProfilePicker(select, name) {
    const single = this.profiles.length < 2;
    select.hidden = single;
    name.hidden = !single;
    name.textContent = this.activeProfile ? this.profileLabel(this.activeProfile) : '';
    this.renderProfileOptions(select);
  }

  async open() {
    if (!this.allowed() || !this.dialog) return;
    const generation = ++this.openGeneration;
    await this.refreshState();
    if (generation !== this.openGeneration || !this.allowed()) return;
    await this.renderDialog();
    if (generation !== this.openGeneration || !this.allowed()) return;
    if (!this.dialog.open) this.dialog.showModal();
    this.closeBtn?.focus();
  }

  close() {
    this.openGeneration++;
    if (this.dialog?.open) this.dialog.close();
  }

  currentMeta() {
    return {
      white: this.app.el?.metaWhite?.textContent || '',
      black: this.app.el?.metaBlack?.textContent || '',
      platform: this.app.checkupGame?.platform,
      result: this.app.el?.metaResult?.textContent || '*',
      isSample: !!this.app.isSampleGame,
      isPositionOnly: document.body.classList.contains('position-only')
    };
  }

  getPerspective() {
    return resolvePerspective(this.currentMeta(), this.activeProfile);
  }

  isSaved(move) {
    if (!this.activeProfile || !move?.fenBefore || !move?.uci) return false;
    return this.savedIds.has(trapId(this.activeProfile.id, move.fenBefore, move.uci));
  }

  eligibleMove(move, review) {
    return this.allowed() && !!review && !review.isPartial && !review.engineOnly &&
      move?.divergenceType === 'intuition_trap' && move.divergenceStatus === 'confirmed' &&
      Number.isFinite(move.verifiedExpectedScoreLoss);
  }

  triggerMoveFor(move) {
    if (!Number.isInteger(move?.ply) || move.ply <= 1) return null;
    const prev = this.app.positions?.[move.ply - 1];
    return prev?.from && prev?.to ? { from: prev.from, to: prev.to, san: prev.san || '' } : null;
  }

  async saveMove(move, review) {
    if (!this.eligibleMove(move, review)) return null;
    await this.refreshState();
    const record = buildTrapRecord(move, review, {
      profileId: this.activeProfile.id,
      source: this.currentMeta(),
      triggerMove: this.triggerMoveFor(move)
    });
    if (!record) return null;
    const outcome = await this.store.upsertTrap(record);
    await this.refreshState();
    return outcome;
  }

  async saveBatchForPerspective(review) {
    if (!this.allowed() || !review?.allMoves?.length) return { added: 0 };
    await this.refreshState();
    const perspective = this.getPerspective();
    if (perspective.mode !== 'self' || !perspective.side) return { added: 0 };
    let added = 0;
    for (const move of review.allMoves) {
      if (move.turn !== perspective.side) continue;
      if (!this.eligibleMove(move, review)) continue;
      const record = buildTrapRecord(move, review, {
        profileId: this.activeProfile.id,
        source: this.currentMeta(),
        triggerMove: this.triggerMoveFor(move)
      });
      if (!record) continue;
      const outcome = await this.store.upsertTrap(record);
      if (outcome?.added) added++;
    }
    await this.refreshState();
    this.app.renderBlunderCards?.();
    this.app.reviewOverview?.render?.();
    return { added };
  }

  addCardActions(card, move, review) {
    if (!this.allowed()) return;
    const row = document.createElement('div');
    row.className = 'review-card-study-actions';

    if (this.app.consequencePlayer?.canPlay(move)) {
      const btnReplay = document.createElement('button');
      btnReplay.type = 'button';
      btnReplay.className = 'btn-header review-consequence-btn';
      btnReplay.textContent = t('consequenceWatch');
      btnReplay.onclick = () => {
        this.app.goToPly(move.ply, { before: true, revealCandidates: true });
        this.app.consequencePlayer.play(move, { mode: 'played' });
      };
      row.append(btnReplay);
    }

    if (this.eligibleMove(move, review)) {
      const btnSave = document.createElement('button');
      btnSave.type = 'button';
      btnSave.className = 'btn-header review-bank-save';
      const syncLabel = () => {
        const saved = this.isSaved(move);
        btnSave.textContent = t(saved ? 'bankSaved' : 'bankSave');
        btnSave.setAttribute('aria-pressed', String(saved));
      };
      syncLabel();
      btnSave.onclick = async () => {
        if (this.isSaved(move)) {
          await this.store.removeTrap(trapId(this.activeProfile.id, move.fenBefore, move.uci));
          await this.refreshState();
          syncLabel();
          this.app.reviewOverview?.render?.();
        } else {
          await this.saveMove(move, review);
          syncLabel();
          this.app.showToast?.(t('bankSavedToast'));
          this.app.reviewOverview?.render?.();
        }
      };
      row.append(btnSave);
    }

    if (row.childElementCount) card.append(row);
  }

  renderOverviewSave(button, review) {
    if (!button) return;
    if (!this.allowed() || !review || review.isPartial || review.engineOnly) {
      button.hidden = true;
      return;
    }
    const perspective = this.getPerspective();
    if (perspective.mode !== 'self' || !perspective.side) {
      button.hidden = true;
      return;
    }
    const traps = (review.allMoves || []).filter(move =>
      move.turn === perspective.side && this.eligibleMove(move, review)
    );
    const unsaved = traps.filter(move => !this.isSaved(move));
    if (!traps.length) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    button.disabled = !unsaved.length;
    button.textContent = unsaved.length
      ? t('bankSaveMineBatch', { count: unsaved.length })
      : t('bankAllMineSaved', { count: traps.length });
    button.onclick = async () => {
      const { added } = await this.saveBatchForPerspective(review);
      if (added) this.app.showToast?.(t('bankSavedBatchToast', { count: added }));
    };
  }

  async startPracticeQueue(queue, startItem = queue[0]) {
    if (!this.allowed() || !queue.length) return;
    this.close();
    this.app.startPractice(startItem, {
      queue,
      mode: 'bank',
      onItemResult: async (item, status) => {
        if (!item?.id) return;
        await this.store.recordPracticeResult(item.id, status);
        await this.refreshState();
      }
    });
  }

  async startDailyPractice() {
    await this.refreshState();
    const due = await this.store.listTraps(this.activeProfile.id, { filter: 'due', phase: this.phase });
    const pool = due.length ? due : await this.store.listTraps(this.activeProfile.id, { filter: 'all', phase: this.phase });
    const queue = pool.slice(0, 5);
    if (!queue.length) return;
    await this.startPracticeQueue(queue, queue[0]);
  }

  async exportJson() {
    const backup = await this.store.exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diverge-study-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  formatDue(trap, now = Date.now()) {
    const next = trap.srs?.nextReviewAt ?? 0;
    if (next <= now) return t('bankDueNow');
    const hours = Math.ceil((next - now) / 3600000);
    if (hours < 24) return t('bankDueHours', { hours });
    return t('bankDueDays', { days: Math.ceil(hours / 24) });
  }

  async renderDialog() {
    if (!this.dialog || !this.activeProfile) return;
    this.renderProfileOptions(this.profileSelect);
    if (this.btnDeleteProfile) {
      this.btnDeleteProfile.hidden = this.activeProfile.id === DEFAULT_PROFILE_ID;
    }
    for (const btn of this.filterButtons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.bankFilter === this.filter));
    }
    if (this.phaseSelect) this.phaseSelect.value = this.phase;
    if (this.sortSelect) this.sortSelect.value = this.sort;

    const traps = await this.store.listTraps(this.activeProfile.id, { filter: this.filter, phase: this.phase, sort: this.sort });
    const stats = await this.store.getProfileStats(this.activeProfile.id);
    const dueCount = stats.dueTotal;
    const checkups = await this.store.listCheckups(this.activeProfile.id);

    if (this.statsEl) {
      this.statsEl.hidden = !stats.total && !checkups.length;
      if (!this.statsEl.hidden) {
        this.statsEl.replaceChildren();
        const summaryLine = document.createElement('span');
        summaryLine.textContent = t('bankStatsSummary', {
          due: stats.dueTotal,
          mastered: stats.masteredTotal,
          opening: stats.dueByPhase.opening,
          middlegame: stats.dueByPhase.middlegame,
          endgame: stats.dueByPhase.endgame
        });
        this.statsEl.append(summaryLine);
        const eloSeries = checkups.filter(c => Number.isFinite(c?.closestElo)).slice(0, 3).reverse().map(c => c.closestElo);
        if (eloSeries.length) {
          const trendLine = document.createElement('small');
          trendLine.textContent = t('bankCheckupTrendNote', { trend: eloSeries.join(' → ') });
          this.statsEl.append(trendLine);
        }
      }
    }

    if (this.statusEl) {
      const aliases = this.activeProfile.aliases?.length
        ? t('bankAliasesNote', { aliases: this.activeProfile.aliases.join(', ') })
        : t('bankNoAliasesNote');
      const persistNote = this.store.persistent ? '' : ` · ${t('bankSessionOnlyNote')}`;
      this.statusEl.textContent = `${aliases}${persistNote}`;
    }

    if (this.btnPractice) {
      const totalInProfile = this.savedIds.size;
      this.btnPractice.disabled = !totalInProfile;
      this.btnPractice.textContent = dueCount > 0
        ? t('bankStartDuePractice', { count: Math.min(5, dueCount) })
        : t('bankStartAnyPractice', { count: Math.min(5, totalInProfile) });
    }

    if (!this.listEl) return;
    this.listEl.replaceChildren();
    if (!traps.length) {
      const empty = document.createElement('p');
      empty.className = 'bank-empty';
      empty.textContent = t(this.filter === 'due' && this.savedIds.size ? 'bankNoDueTraps' : 'bankEmpty');
      this.listEl.append(empty);
      return;
    }

    for (const trap of traps) {
      const card = document.createElement('article');
      card.className = 'bank-trap-item';
      card.dataset.trapId = trap.id;

      const header = document.createElement('div');
      header.className = 'bank-trap-header';
      const title = document.createElement('strong');
      title.textContent = `${trap.moveNumber}${trap.turn === 'w' ? '. ' : '… '}${trap.playedSan} → ${trap.bestSan}`;
      const meta = document.createElement('span');
      meta.className = 'bank-trap-meta';
      const parts = [
        t(`bankPhase_${trap.phase || 'middlegame'}`),
        this.formatDue(trap)
      ].filter(Boolean);
      meta.textContent = parts.join(' · ');
      header.append(title, meta);

      const sub = document.createElement('p');
      sub.className = 'bank-trap-sub';
      const players = [trap.source?.white, trap.source?.black].filter(Boolean).join(' vs ');
      const lossStr = Number.isFinite(trap.eslLoss) ? trap.eslLoss.toFixed(1) : null;
      const temptation = Number.isFinite(trap.humanProb) && trap.elo && lossStr
        ? t('bankTrapTemptation', { elo: trap.elo, prob: Math.round(trap.humanProb * 100), loss: lossStr })
        : lossStr ? t('bankTrapLossOnly', { loss: lossStr }) : '';
      sub.textContent = [temptation, players, trap.srs?.streak ? t('bankStreak', { count: trap.srs.streak }) : ''].filter(Boolean).join(' · ');

      const actions = document.createElement('div');
      actions.className = 'bank-trap-actions';

      const btnRetry = document.createElement('button');
      btnRetry.type = 'button';
      btnRetry.className = 'btn-header btn-primary';
      btnRetry.textContent = t('retryMove');
      btnRetry.onclick = () => this.startPracticeQueue([trap], trap);
      actions.append(btnRetry);

      const btnDual = document.createElement('button');
      btnDual.type = 'button';
      btnDual.className = 'btn-header';
      btnDual.textContent = t('practiceDualEngine');
      btnDual.onclick = () => {
        this.close();
        this.app.enterTemporaryPositionAnalysis?.(trap, { returnTo: 'bank' });
      };
      actions.append(btnDual);

      if (this.app.consequencePlayer?.canPlay(trap)) {
        const btnWatch = document.createElement('button');
        btnWatch.type = 'button';
        btnWatch.className = 'btn-header';
        btnWatch.textContent = t('consequenceWatch');
        btnWatch.onclick = () => {
          this.close();
          document.body.classList.remove('empty-study');
          const intro = document.getElementById('empty-study-intro');
          if (intro) intro.hidden = true;
          this.app.consequencePlayer.play(trap, { mode: 'played' });
        };
        actions.append(btnWatch);
      }

      const btnRemove = document.createElement('button');
      btnRemove.type = 'button';
      btnRemove.className = 'btn-header';
      btnRemove.textContent = t('bankRemove');
      btnRemove.onclick = async () => {
        await this.store.removeTrap(trap.id);
        await this.refreshState();
        await this.renderDialog();
        this.app.renderBlunderCards?.();
      };
      actions.append(btnRemove);

      card.append(header, sub, actions);
      this.listEl.append(card);
    }
  }
}
