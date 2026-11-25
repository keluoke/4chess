import { accountKey, DEFAULT_PROFILE_ID, normalizeAccount, normalizeAlias } from './study-store.js?v=20261124-checkup-cards-r2';
import { t } from './i18n.js?v=20261124-intuition-labels';

function gameAccounts(game) {
  return [game.white, game.black].flatMap((name, index) => {
    const account = normalizeAccount(game.platform, name);
    return account ? [{ account, side: index ? 'black' : 'white' }] : [];
  });
}

export function inferProfileSide(game, profile) {
  if (!game || !profile) return null;
  const accounts = profile.accounts || [];
  const candidates = gameAccounts(game);
  const matches = names => candidates.filter(({ account }) => names.some(name =>
    normalizeAlias(name) === account.username.toLowerCase()));
  const samePlatform = accounts.filter(account => account.platform === game.platform);
  if (samePlatform.length) {
    const linked = matches(samePlatform.map(account => account.username));
    return linked.length === 1 ? linked[0].side : null;
  }
  const crossPlatform = matches(accounts.map(account => account.username));
  if (crossPlatform.length) return crossPlatform.length === 1 ? crossPlatform[0].side : null;
  const name = profile.id === DEFAULT_PROFILE_ID && profile.displayName === 'Default' ? null : profile.displayName;
  const named = matches([name, ...(profile.aliases || [])]);
  return named.length === 1 ? named[0].side : null;
}

export class StudyProfileControls {
  busy = false;
  dismissed = new Set();

  constructor(app) {
    this.app = app;
    this.bank = app.mistakeBank;
    this.select = document.getElementById('studio-profile-select');
    this.picker = document.getElementById('studio-profile-picker');
    this.name = document.getElementById('studio-profile-name');
    this.newButton = document.getElementById('btn-studio-new-profile');
    this.editor = document.getElementById('study-profile-dialog');
    this.editorName = document.getElementById('study-profile-name');
    this.editorTitle = document.getElementById('study-profile-title');
    this.editorHint = document.getElementById('study-profile-hint');
    this.editorSave = document.getElementById('study-profile-save');
    this.editorKeep = document.getElementById('study-profile-keep');
    this.newButton.onclick = () => this.change(() => this.createProfile());
    this.editorKeep.onclick = () => this.editor.close('keep');
    document.getElementById('study-profile-cancel').onclick = () => this.editor.close();
    this.guide = document.getElementById('study-link-guide');
    this.title = document.getElementById('study-link-title');
    this.players = document.getElementById('study-link-players');
    this.dismiss = document.getElementById('study-link-dismiss');
    this.select.onchange = () => this.chooseProfile(this.select.value);
    this.dismiss.onclick = () => {
      if (!this.dismissKey) return;
      this.dismissed.add(this.dismissKey);
      try { sessionStorage.setItem(this.dismissKey, '1'); } catch {}
      this.render();
    };
  }

  async chooseProfile(id) {
    if (this.busy || this.app.checkup.busy || !this.bank.allowed()) return;
    await this.change(() => this.bank.selectProfile(id));
  }

  async change(operation) {
    if (this.busy || this.app.checkup.busy || !this.bank.allowed()) return;
    this.busy = true;
    this.render();
    try {
      await operation();
    } catch {
      this.app.showToast(t('checkupAccountError'));
    } finally {
      this.busy = false;
      this.render();
    }
  }

  async askForProfile({ account, split, move, profile, reportId }) {
    if (this.editor.open) return null;
    const name = this.bank.profileLabel(profile);
    const title = move ? 'studyMoveProfile' : split ? 'studySplitTitle' : 'bankNewProfile';
    const hint = move ? 'studyMoveHint' : split ? (reportId ? 'studySplitReportHint' : 'studySplitHint') : 'studyNewHint';
    this.editorTitle.textContent = t(title);
    this.editorHint.textContent = t(hint, { account: account && this.app.checkup.accountLabel(account), profile: name });
    this.editorName.value = account?.username || '';
    this.editorSave.textContent = t(account && !move ? 'studyCreateAndLink' : 'bankNewProfile');
    this.editorKeep.hidden = !split;
    this.editor.returnValue = '';
    this.editor.showModal();
    this.editorName.select();
    return new Promise(resolve => this.editor.addEventListener('close', () => {
      resolve(this.editor.returnValue);
    }, { once: true }));
  }

  async createProfile({ account, move = false, split = false, reportId } = {}) {
    const profile = this.bank.activeProfile;
    if (!profile || !this.bank.allowed()) return false;
    const epoch = this.app.gameEpoch;
    const checkupOpen = this.app.checkup.dialog?.open;
    const result = await this.askForProfile({ account, move, split, profile, reportId });
    if (!this.bank.allowed() || this.bank.activeProfile?.id !== profile.id || this.app.gameEpoch !== epoch ||
      (checkupOpen && !this.app.checkup.dialog.open)) return false;
    if (result === 'keep') {
      await this.bank.updateProfileAccount(profile.id, account.platform, account.username);
      return true;
    }
    if (result !== 'create') return false;
    const displayName = this.editorName.value.trim();
    if (!displayName) return false;
    const saved = await this.bank.store.saveProfile({
      displayName, account, moveFrom: move ? profile.id : undefined,
      transferCheckup: split && reportId ? { id: reportId, profileId: profile.id } : undefined
    });
    if (!this.bank.allowed() || this.bank.activeProfile?.id !== profile.id || this.app.gameEpoch !== epoch) return false;
    await this.bank.selectProfile(saved.id);
    if (account) this.app.checkupReminders?.offerAfterLink(saved);
    return true;
  }

  async linkAccount(account, { reportId } = {}) {
    const profile = this.bank.activeProfile;
    if (!profile || !this.bank.allowed()) return false;
    const key = accountKey(account);
    if (profile.accounts.some(item => accountKey(item) === key)) return false;
    if (profile.accounts.some(item => item.platform === account.platform)) {
      return this.createProfile({ account, split: true, reportId });
    }
    await this.bank.updateProfileAccount(profile.id, account.platform, account.username);
    return true;
  }

  render() {
    const { activeProfile, profiles } = this.bank;
    const allowed = this.bank.allowed() && !!activeProfile;
    this.picker.hidden = !allowed;
    if (!allowed && this.editor.open) this.editor.close();
    this.select.disabled = this.newButton.disabled = this.busy;
    if (allowed) this.bank.renderProfilePicker(this.select, this.name);

    this.guide.hidden = true;
    this.dismissKey = null;
    const game = this.app.checkupGame;
    if (!allowed || !game || this.app.moves?.isPartial) return;
    const candidates = gameAccounts(game);
    const matches = (profile, account) => profile.accounts?.some(item => accountKey(item) === accountKey(account));
    if (!candidates.length || activeProfile.accounts?.some(item => item.platform === game.platform)) return;
    const key = `diverge-link:${activeProfile.id}:${game.platform}:${game.gameRef}`;
    if (this.dismissed.has(key)) return;
    try { if (sessionStorage.getItem(key)) return; } catch {}
    this.dismissKey = key;

    const platform = game.platform === 'lichess' ? 'Lichess' : 'Chess.com';
    const inferred = inferProfileSide(game, activeProfile);
    const claimed = this.claim?.game === game && this.claim?.profileId === activeProfile.id ? this.claim.side : null;
    const preferred = inferred || claimed;
    this.title.textContent = t('studyLinkTitle');
    this.dismiss.textContent = t('studyLinkWatching');
    this.players.replaceChildren();
    for (const { account, side } of candidates) {
      if (preferred && side !== preferred) continue;
      const owners = profiles.filter(profile => matches(profile, account));
      const label = {
        side: t(side === 'black' ? 'reviewBlack' : 'reviewWhite'),
        player: account.username, platform, profile: this.bank.profileLabel(activeProfile)
      };
      if (preferred) {
        if (owners.length === 1) label.from = this.bank.profileLabel(owners[0]);
        this.title.textContent = t(owners.length === 1 ? 'studyLinkTransfer' : 'studyLinkConfirm', label);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-header';
      button.disabled = this.busy;
      button.textContent = t(owners.length > 1 ? 'studyLinkChooseProfile' : !preferred ? 'studyLinkPlayer'
        : owners.length ? 'studyLinkMove' : 'studyLinkConfirmAction', label);
      button.onclick = () => {
        if (this.app.checkupGame !== game || this.bank.activeProfile?.id !== activeProfile.id) return;
        if (owners.length > 1) {
          this.select.focus();
          return;
        }
        if (owners.length && !preferred) {
          this.claim = { game, profileId: activeProfile.id, side };
          this.render();
          this.players.querySelector('button')?.focus();
          return;
        }
        return this.change(async () => {
          if (owners.length) {
            await this.bank.store.saveProfile({
              id: activeProfile.id, displayName: activeProfile.displayName, account, moveFrom: owners[0].id
            });
            await this.bank.refreshState();
          } else if (!await this.linkAccount(account)) return;
          this.app.showToast(t('checkupAccountSaved', { account: `${platform} · ${account.username}` }));
        });
      };
      this.players.append(button);
    }
    this.guide.hidden = false;
  }
}
